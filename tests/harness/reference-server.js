// tests/harness/reference-server.js
// Complete Reference Server implementing the exact specification in survey_specs.md and FEATURES.md.
// Runs on an ephemeral port using Node.js http and in-memory LibSQL/SQLite.

const http = require('node:http');
const crypto = require('node:crypto');
const { createClient } = require('@libsql/client');
const bcrypt = require('bcryptjs');
const { SignJWT, jwtVerify } = require('jose');
const {
  haversineDistance,
  estimateDurationMinutes,
  optimizeDayStops,
  calculateDayWorkload,
  escapeXml,
} = require('./geo-utils.js');

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'poi-studio-fallback-secret-key-32chars!');

function escapeIcs(str) {
  if (!str) return '';
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

class ReferenceServer {
  constructor(port = 0) {
    this.requestedPort = port;
    this.port = null;
    this.server = null;
    this.db = null;
  }

  async initDb() {
    this.db = createClient({ url: ':memory:' });
    await this.db.execute('PRAGMA foreign_keys = ON;');

    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT,
        avatar_color TEXT NOT NULL DEFAULT '#6366F1',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);

    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS trips (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        start_date TEXT,
        end_date TEXT,
        currency TEXT NOT NULL DEFAULT '€',
        invite_code TEXT NOT NULL UNIQUE,
        scratchpad TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);

    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS trip_members (
        id TEXT PRIMARY KEY,
        trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role TEXT NOT NULL DEFAULT 'EDITOR',
        joined_at INTEGER NOT NULL,
        UNIQUE(trip_id, user_id)
      );
    `);

    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS pois (
        id TEXT PRIMARY KEY,
        trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'OTHER',
        status TEXT NOT NULL DEFAULT 'IDEA',
        is_must_see INTEGER NOT NULL DEFAULT 0,
        lat REAL NOT NULL,
        lng REAL NOT NULL,
        address TEXT,
        day_start INTEGER,
        day_end INTEGER,
        order_index INTEGER NOT NULL DEFAULT 0,
        time_slot TEXT,
        duration_minutes INTEGER,
        transport_mode TEXT NOT NULL DEFAULT 'DRIVING',
        estimated_cost REAL NOT NULL DEFAULT 0,
        cost_type TEXT NOT NULL DEFAULT 'TOTAL',
        paid_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        booking_reference TEXT,
        external_url TEXT,
        notes TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);

    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS poi_votes (
        id TEXT PRIMARY KEY,
        poi_id TEXT NOT NULL REFERENCES pois(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at INTEGER NOT NULL,
        UNIQUE(poi_id, user_id)
      );
    `);

    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS poi_comments (
        id TEXT PRIMARY KEY,
        poi_id TEXT NOT NULL REFERENCES pois(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
    `);

    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS checklist_items (
        id TEXT PRIMARY KEY,
        trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'BEFORE_TRIP',
        is_completed INTEGER NOT NULL DEFAULT 0,
        assigned_to_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
        created_at INTEGER NOT NULL
      );
    `);
  }

  async start() {
    await this.initDb();

    return new Promise((resolve) => {
      this.server = http.createServer(async (req, res) => {
        try {
          await this.handleRequest(req, res);
        } catch (err) {
          console.error('Server error:', err);
          if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Internal Server Error', message: err.message }));
          }
        }
      });

      this.server.listen(this.requestedPort, '127.0.0.1', () => {
        this.port = this.server.address().port;
        resolve(`http://127.0.0.1:${this.port}`);
      });
    });
  }

  async stop() {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => resolve());
      } else {
        resolve();
      }
    });
  }

  parseCookies(req) {
    const list = {};
    const rc = req.headers.cookie;
    if (rc) {
      rc.split(';').forEach((cookie) => {
        const parts = cookie.split('=');
        list[parts.shift().trim()] = decodeURI(parts.join('='));
      });
    }
    return list;
  }

  async getSessionUser(req) {
    const cookies = this.parseCookies(req);
    const token = cookies.auth_token || cookies.session_token || cookies.poi_session;
    if (!token) return null;

    try {
      const { payload } = await jwtVerify(token, JWT_SECRET);
      if (!payload || !payload.sub) return null;

      const userRes = await this.db.execute({
        sql: 'SELECT id, username, avatar_color, password_hash FROM users WHERE id = ?',
        args: [payload.sub],
      });
      if (userRes.rows.length === 0) return null;

      const row = userRes.rows[0];
      return {
        id: row.id,
        username: row.username,
        avatarColor: row.avatar_color,
        passwordHash: row.password_hash,
      };
    } catch {
      return null;
    }
  }

  async readBody(req) {
    return new Promise((resolve, reject) => {
      let data = '';
      req.on('data', (chunk) => {
        data += chunk;
      });
      req.on('end', () => {
        if (!data) return resolve({});
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(data);
        }
      });
      req.on('error', reject);
    });
  }

  sendJson(res, status, data, headers = {}) {
    res.writeHead(status, {
      'Content-Type': 'application/json',
      ...headers,
    });
    res.end(JSON.stringify(data));
  }

  sendError(res, status, message) {
    this.sendJson(res, status, { error: message });
  }

  async handleRequest(req, res) {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`);
    const pathname = parsedUrl.pathname;
    const method = req.method.toUpperCase();
    const currentUser = await this.getSessionUser(req);

    // --- 1. Auth Routes ---

    if (method === 'POST' && pathname === '/api/auth/login') {
      const body = await this.readBody(req);
      const rawUsername = body.username;
      if (!rawUsername || typeof rawUsername !== 'string' || !rawUsername.trim()) {
        return this.sendError(res, 400, 'Username is required');
      }

      const username = rawUsername.trim();
      const password = body.password !== undefined && body.password !== null ? String(body.password) : null;

      const userRes = await this.db.execute({
        sql: 'SELECT * FROM users WHERE username = ? COLLATE NOCASE',
        args: [username],
      });

      let user;
      const now = Date.now();

      if (userRes.rows.length === 0) {
        // Auto-registration
        const userId = crypto.randomUUID();
        const passwordHash = password ? bcrypt.hashSync(password, 10) : null;
        const avatarColor = '#6366F1';

        await this.db.execute({
          sql: 'INSERT INTO users (id, username, password_hash, avatar_color, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
          args: [userId, username, passwordHash, avatarColor, now, now],
        });

        user = { id: userId, username, avatarColor };
      } else {
        const row = userRes.rows[0];
        if (row.password_hash !== null) {
          if (!password) {
            return this.sendError(res, 401, 'Password is required for this account');
          }
          const valid = bcrypt.compareSync(password, row.password_hash);
          if (!valid) {
            return this.sendError(res, 401, 'Invalid username or password');
          }
        }
        user = { id: row.id, username: row.username, avatarColor: row.avatar_color };
      }

      // Issue JWT session token (30 days)
      const token = await new SignJWT({ sub: user.id, username: user.username, avatarColor: user.avatarColor })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('30d')
        .sign(JWT_SECRET);

      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Set-Cookie': `auth_token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`,
      });
      return res.end(JSON.stringify({ user }));
    }

    if (method === 'POST' && pathname === '/api/auth/logout') {
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Set-Cookie': 'auth_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0',
      });
      return res.end(JSON.stringify({ success: true }));
    }

    if (method === 'GET' && pathname === '/api/auth/me') {
      if (!currentUser) return this.sendError(res, 401, 'Unauthorized');
      return this.sendJson(res, 200, {
        user: { id: currentUser.id, username: currentUser.username, avatarColor: currentUser.avatarColor },
      });
    }

    if (method === 'PUT' && pathname === '/api/auth/profile') {
      if (!currentUser) return this.sendError(res, 401, 'Unauthorized');
      const body = await this.readBody(req);
      let updatedAvatar = currentUser.avatarColor;

      if (body.avatarColor) {
        updatedAvatar = body.avatarColor;
      }

      let newHash = currentUser.passwordHash;
      if (body.newPassword !== undefined) {
        if (currentUser.passwordHash !== null) {
          if (!body.currentPassword || !bcrypt.compareSync(body.currentPassword, currentUser.passwordHash)) {
            return this.sendError(res, 401, 'Current password incorrect');
          }
        }
        if (body.newPassword === null || body.newPassword === '') {
          newHash = null;
        } else {
          newHash = bcrypt.hashSync(body.newPassword, 10);
        }
      }

      await this.db.execute({
        sql: 'UPDATE users SET avatar_color = ?, password_hash = ?, updated_at = ? WHERE id = ?',
        args: [updatedAvatar, newHash, Date.now(), currentUser.id],
      });

      return this.sendJson(res, 200, {
        user: { id: currentUser.id, username: currentUser.username, avatarColor: updatedAvatar },
      });
    }

    // --- 2. Trips Dashboard & CRUD ---

    if (method === 'GET' && pathname === '/api/trips') {
      if (!currentUser) return this.sendError(res, 401, 'Unauthorized');

      const tripsRes = await this.db.execute({
        sql: `
          SELECT t.*, tm.role 
          FROM trips t
          JOIN trip_members tm ON t.id = tm.trip_id
          WHERE tm.user_id = ?
          ORDER BY t.start_date ASC, t.created_at DESC
        `,
        args: [currentUser.id],
      });

      const tripCards = [];
      for (const row of tripsRes.rows) {
        const membersRes = await this.db.execute({
          sql: `
            SELECT u.id, u.username, u.avatar_color 
            FROM trip_members tm
            JOIN users u ON tm.user_id = u.id
            WHERE tm.trip_id = ?
          `,
          args: [row.id],
        });

        const poisRes = await this.db.execute({
          sql: `SELECT day_start, estimated_cost FROM pois WHERE trip_id = ?`,
          args: [row.id],
        });

        let plannedCount = 0;
        let ideaCount = 0;
        let totalCost = 0;

        for (const poi of poisRes.rows) {
          if (poi.day_start !== null) plannedCount++;
          else ideaCount++;
          totalCost += Number(poi.estimated_cost) || 0;
        }

        tripCards.push({
          id: row.id,
          title: row.title,
          description: row.description,
          startDate: row.start_date,
          endDate: row.end_date,
          currency: row.currency,
          inviteCode: row.invite_code,
          scratchpad: row.scratchpad,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          role: row.role,
          memberCount: membersRes.rows.length,
          plannedPoiCount: plannedCount,
          ideaPoiCount: ideaCount,
          totalEstimatedCost: totalCost,
          members: membersRes.rows.map((m) => ({ id: m.id, username: m.username, avatarColor: m.avatar_color })),
        });
      }

      return this.sendJson(res, 200, { trips: tripCards });
    }

    if (method === 'POST' && pathname === '/api/trips') {
      if (!currentUser) return this.sendError(res, 401, 'Unauthorized');
      const body = await this.readBody(req);
      if (!body.title || !String(body.title).trim()) {
        return this.sendError(res, 400, 'Title is required');
      }

      const tripId = crypto.randomUUID();
      const inviteCode = crypto.randomBytes(5).toString('hex'); // 10 chars
      const now = Date.now();
      const currency = body.currency || '€';

      await this.db.execute({
        sql: `INSERT INTO trips (id, title, description, start_date, end_date, currency, invite_code, scratchpad, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          tripId,
          body.title.trim(),
          body.description || null,
          body.startDate || null,
          body.endDate || null,
          currency,
          inviteCode,
          body.scratchpad || null,
          now,
          now,
        ],
      });

      // Add creator as OWNER
      await this.db.execute({
        sql: `INSERT INTO trip_members (id, trip_id, user_id, role, joined_at) VALUES (?, ?, ?, 'OWNER', ?)`,
        args: [crypto.randomUUID(), tripId, currentUser.id, now],
      });

      return this.sendJson(
        res,
        201,
        {
          trip: {
            id: tripId,
            title: body.title.trim(),
            description: body.description || null,
            startDate: body.startDate || null,
            endDate: body.endDate || null,
            currency,
            inviteCode,
            scratchpad: body.scratchpad || null,
            createdAt: now,
            updatedAt: now,
          },
        }
      );
    }

    if (method === 'POST' && pathname === '/api/trips/join') {
      if (!currentUser) return this.sendError(res, 401, 'Unauthorized');
      const body = await this.readBody(req);
      const inviteCode = body.inviteCode;
      if (!inviteCode) return this.sendError(res, 400, 'Invite code is required');

      const tripRes = await this.db.execute({
        sql: 'SELECT id FROM trips WHERE invite_code = ?',
        args: [inviteCode],
      });

      if (tripRes.rows.length === 0) {
        return this.sendError(res, 404, 'Invalid or expired invite link');
      }

      const tripId = tripRes.rows[0].id;
      // Check existing membership
      const memberRes = await this.db.execute({
        sql: 'SELECT role FROM trip_members WHERE trip_id = ? AND user_id = ?',
        args: [tripId, currentUser.id],
      });

      if (memberRes.rows.length > 0) {
        return this.sendJson(res, 200, { tripId, role: memberRes.rows[0].role });
      }

      await this.db.execute({
        sql: `INSERT INTO trip_members (id, trip_id, user_id, role, joined_at) VALUES (?, ?, ?, 'EDITOR', ?)`,
        args: [crypto.randomUUID(), tripId, currentUser.id, Date.now()],
      });

      return this.sendJson(res, 200, { tripId, role: 'EDITOR' });
    }

    // --- Dynamic Trip Routes: /api/trips/:tripId/... ---
    const tripRouteMatch = pathname.match(/^\/api\/trips\/([^/]+)(.*)$/);
    if (tripRouteMatch) {
      const tripId = tripRouteMatch[1];
      const subPath = tripRouteMatch[2];

      // Helper to check user membership and role in trip
      const checkRole = async () => {
        if (!currentUser) return { allowed: false, status: 401, message: 'Unauthorized' };
        const memberRes = await this.db.execute({
          sql: 'SELECT role FROM trip_members WHERE trip_id = ? AND user_id = ?',
          args: [tripId, currentUser.id],
        });
        if (memberRes.rows.length === 0) {
          return { allowed: false, status: 403, message: 'Forbidden: Not a member of this trip' };
        }
        return { allowed: true, role: memberRes.rows[0].role };
      };

      // 1. GET /api/trips/:tripId
      if (method === 'GET' && subPath === '') {
        const roleCheck = await checkRole();
        if (!roleCheck.allowed) return this.sendError(res, roleCheck.status, roleCheck.message);

        const tripRes = await this.db.execute({
          sql: 'SELECT * FROM trips WHERE id = ?',
          args: [tripId],
        });
        if (tripRes.rows.length === 0) return this.sendError(res, 404, 'Trip not found');

        const trip = tripRes.rows[0];

        // Members
        const membersRes = await this.db.execute({
          sql: `SELECT tm.id, tm.role, tm.joined_at, u.id as user_id, u.username, u.avatar_color
                FROM trip_members tm
                JOIN users u ON tm.user_id = u.id
                WHERE tm.trip_id = ?`,
          args: [tripId],
        });

        // POIs
        const poisRes = await this.db.execute({
          sql: `SELECT * FROM pois WHERE trip_id = ? ORDER BY order_index ASC`,
          args: [tripId],
        });

        const pois = [];
        for (const poi of poisRes.rows) {
          const votesRes = await this.db.execute({
            sql: `SELECT u.username, pv.user_id FROM poi_votes pv JOIN users u ON pv.user_id = u.id WHERE pv.poi_id = ?`,
            args: [poi.id],
          });
          const commentsRes = await this.db.execute({
            sql: `SELECT pc.id, pc.content, pc.created_at, u.id as user_id, u.username, u.avatar_color
                  FROM poi_comments pc
                  JOIN users u ON pc.user_id = u.id
                  WHERE pc.poi_id = ?
                  ORDER BY pc.created_at ASC`,
            args: [poi.id],
          });

          pois.push({
            id: poi.id,
            tripId: poi.trip_id,
            title: poi.title,
            category: poi.category,
            status: poi.status,
            isMustSee: Boolean(poi.is_must_see),
            lat: poi.lat,
            lng: poi.lng,
            address: poi.address,
            dayStart: poi.day_start,
            dayEnd: poi.day_end,
            orderIndex: poi.order_index,
            timeSlot: poi.time_slot,
            durationMinutes: poi.duration_minutes,
            transportMode: poi.transport_mode,
            estimatedCost: poi.estimated_cost,
            costType: poi.cost_type,
            paidByUserId: poi.paid_by_user_id,
            bookingReference: poi.booking_reference,
            externalUrl: poi.external_url,
            notes: poi.notes,
            voteCount: votesRes.rows.length,
            hasVoted: votesRes.rows.some((v) => v.user_id === currentUser.id),
            voterNames: votesRes.rows.map((v) => v.username),
            comments: commentsRes.rows.map((c) => ({
              id: c.id,
              content: c.content,
              createdAt: c.created_at,
              user: { id: c.user_id, username: c.username, avatarColor: c.avatar_color },
            })),
          });
        }

        // Checklists
        const checkRes = await this.db.execute({
          sql: `SELECT ci.*, u.username, u.avatar_color 
                FROM checklist_items ci
                LEFT JOIN users u ON ci.assigned_to_user_id = u.id
                WHERE ci.trip_id = ?`,
          args: [tripId],
        });

        const checklistItems = checkRes.rows.map((ci) => ({
          id: ci.id,
          tripId: ci.trip_id,
          title: ci.title,
          category: ci.category,
          isCompleted: Boolean(ci.is_completed),
          assignedToUserId: ci.assigned_to_user_id,
          assignedTo: ci.assigned_to_user_id
            ? { id: ci.assigned_to_user_id, username: ci.username, avatarColor: ci.avatar_color }
            : null,
          createdAt: ci.created_at,
        }));

        return this.sendJson(res, 200, {
          trip: {
            id: trip.id,
            title: trip.title,
            description: trip.description,
            startDate: trip.start_date,
            endDate: trip.end_date,
            currency: trip.currency,
            inviteCode: trip.invite_code,
            scratchpad: trip.scratchpad,
            createdAt: trip.created_at,
            updatedAt: trip.updated_at,
            currentUserRole: roleCheck.role,
            members: membersRes.rows.map((m) => ({
              id: m.id,
              role: m.role,
              joinedAt: m.joined_at,
              user: { id: m.user_id, username: m.username, avatarColor: m.avatar_color },
            })),
            pois,
            checklistItems,
          },
        });
      }

      // 2. PUT /api/trips/:tripId
      if (method === 'PUT' && subPath === '') {
        const roleCheck = await checkRole();
        if (!roleCheck.allowed) return this.sendError(res, roleCheck.status, roleCheck.message);

        const body = await this.readBody(req);
        const isEditingMeta =
          body.title !== undefined ||
          body.startDate !== undefined ||
          body.endDate !== undefined ||
          body.currency !== undefined;

        if (isEditingMeta && roleCheck.role !== 'OWNER') {
          return this.sendError(res, 403, 'Forbidden: Only OWNER can edit trip settings');
        }

        if (body.scratchpad !== undefined && roleCheck.role === 'VIEWER') {
          return this.sendError(res, 403, 'Forbidden: VIEWER cannot modify scratchpad');
        }

        const currentTripRes = await this.db.execute({
          sql: 'SELECT * FROM trips WHERE id = ?',
          args: [tripId],
        });
        if (currentTripRes.rows.length === 0) return this.sendError(res, 404, 'Trip not found');
        const curr = currentTripRes.rows[0];

        const updatedTitle = body.title !== undefined ? String(body.title).trim() : curr.title;
        const updatedDesc = body.description !== undefined ? body.description : curr.description;
        const updatedStart = body.startDate !== undefined ? body.startDate : curr.start_date;
        const updatedEnd = body.endDate !== undefined ? body.endDate : curr.end_date;
        const updatedCurr = body.currency !== undefined ? body.currency : curr.currency;
        const updatedScratch = body.scratchpad !== undefined ? body.scratchpad : curr.scratchpad;

        await this.db.execute({
          sql: `UPDATE trips SET title = ?, description = ?, start_date = ?, end_date = ?, currency = ?, scratchpad = ?, updated_at = ?
                WHERE id = ?`,
          args: [updatedTitle, updatedDesc, updatedStart, updatedEnd, updatedCurr, updatedScratch, Date.now(), tripId],
        });

        return this.sendJson(res, 200, {
          trip: {
            id: tripId,
            title: updatedTitle,
            description: updatedDesc,
            startDate: updatedStart,
            endDate: updatedEnd,
            currency: updatedCurr,
            scratchpad: updatedScratch,
          },
        });
      }

      // 3. DELETE /api/trips/:tripId
      if (method === 'DELETE' && subPath === '') {
        const roleCheck = await checkRole();
        if (!roleCheck.allowed) return this.sendError(res, roleCheck.status, roleCheck.message);
        if (roleCheck.role !== 'OWNER') {
          return this.sendError(res, 403, 'Forbidden: Only OWNER can delete trip');
        }

        await this.db.execute({
          sql: 'DELETE FROM trips WHERE id = ?',
          args: [tripId],
        });
        return this.sendJson(res, 200, { success: true });
      }

      // 4. POST /api/trips/:tripId/duplicate
      if (method === 'POST' && subPath === '/duplicate') {
        const roleCheck = await checkRole();
        if (!roleCheck.allowed) return this.sendError(res, roleCheck.status, roleCheck.message);

        const body = await this.readBody(req);
        const sourceRes = await this.db.execute({
          sql: 'SELECT * FROM trips WHERE id = ?',
          args: [tripId],
        });
        if (sourceRes.rows.length === 0) return this.sendError(res, 404, 'Source trip not found');
        const source = sourceRes.rows[0];

        const newTripId = crypto.randomUUID();
        const newInviteCode = crypto.randomBytes(5).toString('hex');
        const newTitle = body.title || `${source.title} (Template Copy)`;
        const now = Date.now();

        await this.db.execute({
          sql: `INSERT INTO trips (id, title, description, start_date, end_date, currency, invite_code, scratchpad, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            newTripId,
            newTitle,
            source.description,
            source.start_date,
            source.end_date,
            source.currency,
            newInviteCode,
            source.scratchpad,
            now,
            now,
          ],
        });

        // Set caller as OWNER
        await this.db.execute({
          sql: `INSERT INTO trip_members (id, trip_id, user_id, role, joined_at) VALUES (?, ?, ?, 'OWNER', ?)`,
          args: [crypto.randomUUID(), newTripId, currentUser.id, now],
        });

        // Clone POIs resetting status to PLANNED and resetting votes
        const poisRes = await this.db.execute({
          sql: 'SELECT * FROM pois WHERE trip_id = ?',
          args: [tripId],
        });

        for (const p of poisRes.rows) {
          await this.db.execute({
            sql: `INSERT INTO pois (id, trip_id, title, category, status, is_must_see, lat, lng, address, day_start, day_end, order_index, time_slot, duration_minutes, transport_mode, estimated_cost, cost_type, booking_reference, external_url, notes, created_at, updated_at)
                  VALUES (?, ?, ?, ?, 'PLANNED', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [
              crypto.randomUUID(),
              newTripId,
              p.title,
              p.category,
              p.is_must_see,
              p.lat,
              p.lng,
              p.address,
              p.day_start,
              p.day_end,
              p.order_index,
              p.time_slot,
              p.duration_minutes,
              p.transport_mode,
              p.estimated_cost,
              p.cost_type,
              null, // reset booking ref
              p.external_url,
              p.notes,
              now,
              now,
            ],
          });
        }

        // Clone checklists resetting completion
        const checkRes = await this.db.execute({
          sql: 'SELECT * FROM checklist_items WHERE trip_id = ?',
          args: [tripId],
        });

        for (const c of checkRes.rows) {
          await this.db.execute({
            sql: `INSERT INTO checklist_items (id, trip_id, title, category, is_completed, assigned_to_user_id, created_at)
                  VALUES (?, ?, ?, ?, 0, NULL, ?)`,
            args: [crypto.randomUUID(), newTripId, c.title, c.category, now],
          });
        }

        return this.sendJson(res, 201, { trip: { id: newTripId, title: newTitle, inviteCode: newInviteCode } });
      }

      // 5. POST /api/trips/:tripId/invite-code (Regenerate)
      if (method === 'POST' && subPath === '/invite-code') {
        const roleCheck = await checkRole();
        if (!roleCheck.allowed) return this.sendError(res, roleCheck.status, roleCheck.message);
        if (roleCheck.role !== 'OWNER') {
          return this.sendError(res, 403, 'Forbidden: Only OWNER can regenerate invite code');
        }

        const newCode = crypto.randomBytes(5).toString('hex');
        await this.db.execute({
          sql: 'UPDATE trips SET invite_code = ?, updated_at = ? WHERE id = ?',
          args: [newCode, Date.now(), tripId],
        });

        return this.sendJson(res, 200, { inviteCode: newCode });
      }

      // 6. Member management: /api/trips/:tripId/members
      if (method === 'GET' && subPath === '/members') {
        const roleCheck = await checkRole();
        if (!roleCheck.allowed) return this.sendError(res, roleCheck.status, roleCheck.message);

        const membersRes = await this.db.execute({
          sql: `SELECT tm.id, tm.role, tm.joined_at, u.id as user_id, u.username, u.avatar_color
                FROM trip_members tm
                JOIN users u ON tm.user_id = u.id
                WHERE tm.trip_id = ?`,
          args: [tripId],
        });

        return this.sendJson(res, 200, {
          members: membersRes.rows.map((m) => ({
            id: m.id,
            role: m.role,
            joinedAt: m.joined_at,
            user: { id: m.user_id, username: m.username, avatarColor: m.avatar_color },
          })),
        });
      }

      const memberMatch = subPath.match(/^\/members\/([^/]+)$/);
      if (memberMatch) {
        const targetUserId = memberMatch[1];

        // PUT /api/trips/:tripId/members/:userId (Change role)
        if (method === 'PUT') {
          const roleCheck = await checkRole();
          if (!roleCheck.allowed) return this.sendError(res, roleCheck.status, roleCheck.message);
          if (roleCheck.role !== 'OWNER') {
            return this.sendError(res, 403, 'Forbidden: Only OWNER can manage roles');
          }

          const body = await this.readBody(req);
          const newRole = body.role;
          if (!['OWNER', 'EDITOR', 'VIEWER'].includes(newRole)) {
            return this.sendError(res, 400, 'Invalid role');
          }

          // Check if demoting the only owner
          if (targetUserId === currentUser.id && newRole !== 'OWNER') {
            const ownerCountRes = await this.db.execute({
              sql: `SELECT COUNT(*) as cnt FROM trip_members WHERE trip_id = ? AND role = 'OWNER'`,
              args: [tripId],
            });
            if (Number(ownerCountRes.rows[0].cnt) <= 1) {
              return this.sendError(res, 400, 'Cannot demote the sole trip OWNER');
            }
          }

          await this.db.execute({
            sql: 'UPDATE trip_members SET role = ? WHERE trip_id = ? AND user_id = ?',
            args: [newRole, tripId, targetUserId],
          });

          return this.sendJson(res, 200, { success: true, role: newRole });
        }

        // DELETE /api/trips/:tripId/members/:userId (Remove member or leave)
        if (method === 'DELETE') {
          const roleCheck = await checkRole();
          if (!roleCheck.allowed) return this.sendError(res, roleCheck.status, roleCheck.message);

          const isSelf = targetUserId === currentUser.id;
          if (!isSelf && roleCheck.role !== 'OWNER') {
            return this.sendError(res, 403, 'Forbidden: Only OWNER can remove other members');
          }

          // Sole owner cannot leave without transferring ownership
          const targetMemberRes = await this.db.execute({
            sql: 'SELECT role FROM trip_members WHERE trip_id = ? AND user_id = ?',
            args: [tripId, targetUserId],
          });
          if (targetMemberRes.rows.length === 0) {
            return this.sendError(res, 404, 'Member not found');
          }

          if (targetMemberRes.rows[0].role === 'OWNER') {
            const ownerCountRes = await this.db.execute({
              sql: `SELECT COUNT(*) as cnt FROM trip_members WHERE trip_id = ? AND role = 'OWNER'`,
              args: [tripId],
            });
            if (Number(ownerCountRes.rows[0].cnt) <= 1) {
              return this.sendError(res, 400, 'Trip must retain at least one OWNER');
            }
          }

          await this.db.execute({
            sql: 'DELETE FROM trip_members WHERE trip_id = ? AND user_id = ?',
            args: [tripId, targetUserId],
          });

          return this.sendJson(res, 200, { success: true });
        }
      }

      // 7. POI Routes
      if (method === 'POST' && subPath === '/pois') {
        const roleCheck = await checkRole();
        if (!roleCheck.allowed) return this.sendError(res, roleCheck.status, roleCheck.message);
        if (roleCheck.role === 'VIEWER') {
          return this.sendError(res, 403, 'Forbidden: VIEWER cannot add POIs');
        }

        const body = await this.readBody(req);
        if (!body.title || typeof body.title !== 'string' || !body.title.trim()) {
          return this.sendError(res, 400, 'POI title is required');
        }
        if (body.lat === undefined || body.lng === undefined || isNaN(Number(body.lat)) || isNaN(Number(body.lng))) {
          return this.sendError(res, 400, 'Valid coordinates are required');
        }

        const lat = Number(body.lat);
        const lng = Number(body.lng);
        if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
          return this.sendError(res, 400, 'Coordinates out of bounds');
        }

        const poiId = crypto.randomUUID();
        const now = Date.now();

        await this.db.execute({
          sql: `INSERT INTO pois (id, trip_id, title, category, status, is_must_see, lat, lng, address, day_start, day_end, order_index, time_slot, duration_minutes, transport_mode, estimated_cost, cost_type, paid_by_user_id, booking_reference, external_url, notes, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            poiId,
            tripId,
            body.title.trim(),
            body.category || 'OTHER',
            body.status || 'IDEA',
            body.isMustSee ? 1 : 0,
            lat,
            lng,
            body.address || null,
            body.dayStart !== undefined ? body.dayStart : null,
            body.dayEnd !== undefined ? body.dayEnd : null,
            body.orderIndex !== undefined ? body.orderIndex : 0,
            body.timeSlot || null,
            body.durationMinutes || null,
            body.transportMode || 'DRIVING',
            body.estimatedCost || 0,
            body.costType || 'TOTAL',
            body.paidByUserId || null,
            body.bookingReference || null,
            body.externalUrl || null,
            body.notes || null,
            now,
            now,
          ],
        });

        return this.sendJson(res, 201, {
          poi: {
            id: poiId,
            tripId,
            title: body.title.trim(),
            category: body.category || 'OTHER',
            status: body.status || 'IDEA',
            isMustSee: Boolean(body.isMustSee),
            lat,
            lng,
            dayStart: body.dayStart,
            dayEnd: body.dayEnd,
          },
        });
      }

      if (method === 'POST' && subPath === '/pois/reorder') {
        const roleCheck = await checkRole();
        if (!roleCheck.allowed) return this.sendError(res, roleCheck.status, roleCheck.message);
        if (roleCheck.role === 'VIEWER') {
          return this.sendError(res, 403, 'Forbidden: VIEWER cannot reorder POIs');
        }

        const body = await this.readBody(req);
        const items = body.items || [];
        for (const item of items) {
          await this.db.execute({
            sql: `UPDATE pois SET order_index = ?, day_start = ?, updated_at = ? WHERE id = ? AND trip_id = ?`,
            args: [item.orderIndex, item.dayStart !== undefined ? item.dayStart : null, Date.now(), item.id, tripId],
          });
        }

        return this.sendJson(res, 200, { success: true });
      }

      if (method === 'POST' && subPath === '/pois/optimize-day') {
        const roleCheck = await checkRole();
        if (!roleCheck.allowed) return this.sendError(res, roleCheck.status, roleCheck.message);
        if (roleCheck.role === 'VIEWER') {
          return this.sendError(res, 403, 'Forbidden: VIEWER cannot optimize routes');
        }

        const body = await this.readBody(req);
        const day = Number(body.day);
        if (isNaN(day)) return this.sendError(res, 400, 'Valid day number required');

        const poisRes = await this.db.execute({
          sql: `SELECT * FROM pois WHERE trip_id = ? AND (day_start = ? OR (category = 'ACCOMMODATION' AND day_start <= ? AND (day_end IS NULL OR day_end >= ?))) ORDER BY order_index ASC`,
          args: [tripId, day, day, day],
        });

        const stops = poisRes.rows.map((p) => ({
          id: p.id,
          title: p.title,
          category: p.category,
          dayStart: p.day_start,
          dayEnd: p.day_end,
          lat: Number(p.lat),
          lng: Number(p.lng),
          orderIndex: p.order_index,
        }));

        const optimized = optimizeDayStops(stops, day);

        for (const opt of optimized) {
          await this.db.execute({
            sql: 'UPDATE pois SET order_index = ?, updated_at = ? WHERE id = ?',
            args: [opt.orderIndex, Date.now(), opt.id],
          });
        }

        return this.sendJson(res, 200, { pois: optimized });
      }

      const poiMatch = subPath.match(/^\/pois\/([^/]+)(.*)$/);
      if (poiMatch) {
        const poiId = poiMatch[1];
        const poiSubPath = poiMatch[2];

        // PUT /api/trips/:tripId/pois/:poiId
        if (method === 'PUT' && poiSubPath === '') {
          const roleCheck = await checkRole();
          if (!roleCheck.allowed) return this.sendError(res, roleCheck.status, roleCheck.message);
          if (roleCheck.role === 'VIEWER') {
            return this.sendError(res, 403, 'Forbidden: VIEWER cannot update POIs');
          }

          const body = await this.readBody(req);
          const poiRes = await this.db.execute({
            sql: 'SELECT * FROM pois WHERE id = ? AND trip_id = ?',
            args: [poiId, tripId],
          });
          if (poiRes.rows.length === 0) return this.sendError(res, 404, 'POI not found');
          const curr = poiRes.rows[0];

          await this.db.execute({
            sql: `UPDATE pois SET
                    title = ?, category = ?, status = ?, is_must_see = ?,
                    lat = ?, lng = ?, address = ?, day_start = ?, day_end = ?,
                    order_index = ?, time_slot = ?, duration_minutes = ?,
                    transport_mode = ?, estimated_cost = ?, cost_type = ?,
                    booking_reference = ?, external_url = ?, notes = ?, updated_at = ?
                  WHERE id = ? AND trip_id = ?`,
            args: [
              body.title !== undefined ? body.title : curr.title,
              body.category !== undefined ? body.category : curr.category,
              body.status !== undefined ? body.status : curr.status,
              body.isMustSee !== undefined ? (body.isMustSee ? 1 : 0) : curr.is_must_see,
              body.lat !== undefined ? body.lat : curr.lat,
              body.lng !== undefined ? body.lng : curr.lng,
              body.address !== undefined ? body.address : curr.address,
              body.dayStart !== undefined ? body.dayStart : curr.day_start,
              body.dayEnd !== undefined ? body.dayEnd : curr.day_end,
              body.orderIndex !== undefined ? body.orderIndex : curr.order_index,
              body.timeSlot !== undefined ? body.timeSlot : curr.time_slot,
              body.durationMinutes !== undefined ? body.durationMinutes : curr.duration_minutes,
              body.transportMode !== undefined ? body.transportMode : curr.transport_mode,
              body.estimatedCost !== undefined ? body.estimatedCost : curr.estimated_cost,
              body.costType !== undefined ? body.costType : curr.cost_type,
              body.bookingReference !== undefined ? body.bookingReference : curr.booking_reference,
              body.externalUrl !== undefined ? body.externalUrl : curr.external_url,
              body.notes !== undefined ? body.notes : curr.notes,
              Date.now(),
              poiId,
              tripId,
            ],
          });

          return this.sendJson(res, 200, { success: true, poiId });
        }

        // DELETE /api/trips/:tripId/pois/:poiId
        if (method === 'DELETE' && poiSubPath === '') {
          const roleCheck = await checkRole();
          if (!roleCheck.allowed) return this.sendError(res, roleCheck.status, roleCheck.message);
          if (roleCheck.role === 'VIEWER') {
            return this.sendError(res, 403, 'Forbidden: VIEWER cannot delete POIs');
          }

          await this.db.execute({
            sql: 'DELETE FROM pois WHERE id = ? AND trip_id = ?',
            args: [poiId, tripId],
          });
          return this.sendJson(res, 200, { success: true });
        }

        // POST /api/trips/:tripId/pois/:poiId/votes
        if (method === 'POST' && poiSubPath === '/votes') {
          const roleCheck = await checkRole();
          if (!roleCheck.allowed) return this.sendError(res, roleCheck.status, roleCheck.message);
          if (roleCheck.role === 'VIEWER') {
            return this.sendError(res, 403, 'Forbidden: VIEWER cannot vote');
          }

          const existingRes = await this.db.execute({
            sql: 'SELECT id FROM poi_votes WHERE poi_id = ? AND user_id = ?',
            args: [poiId, currentUser.id],
          });

          let voted;
          if (existingRes.rows.length > 0) {
            await this.db.execute({
              sql: 'DELETE FROM poi_votes WHERE id = ?',
              args: [existingRes.rows[0].id],
            });
            voted = false;
          } else {
            await this.db.execute({
              sql: 'INSERT INTO poi_votes (id, poi_id, user_id, created_at) VALUES (?, ?, ?, ?)',
              args: [crypto.randomUUID(), poiId, currentUser.id, Date.now()],
            });
            voted = true;
          }

          const votesRes = await this.db.execute({
            sql: `SELECT u.username FROM poi_votes pv JOIN users u ON pv.user_id = u.id WHERE pv.poi_id = ?`,
            args: [poiId],
          });

          return this.sendJson(res, 200, {
            voted,
            voteCount: votesRes.rows.length,
            voters: votesRes.rows.map((r) => r.username),
          });
        }

        // Comments: /api/trips/:tripId/pois/:poiId/comments
        if (method === 'POST' && poiSubPath === '/comments') {
          const roleCheck = await checkRole();
          if (!roleCheck.allowed) return this.sendError(res, roleCheck.status, roleCheck.message);
          if (roleCheck.role === 'VIEWER') {
            return this.sendError(res, 403, 'Forbidden: VIEWER cannot post comments');
          }

          const body = await this.readBody(req);
          if (!body.content || !String(body.content).trim()) {
            return this.sendError(res, 400, 'Comment content cannot be empty');
          }

          const commentId = crypto.randomUUID();
          const now = Date.now();

          await this.db.execute({
            sql: 'INSERT INTO poi_comments (id, poi_id, user_id, content, created_at) VALUES (?, ?, ?, ?, ?)',
            args: [commentId, poiId, currentUser.id, body.content.trim(), now],
          });

          return this.sendJson(res, 201, {
            comment: {
              id: commentId,
              poiId,
              content: body.content.trim(),
              createdAt: now,
              user: { id: currentUser.id, username: currentUser.username, avatarColor: currentUser.avatarColor },
            },
          });
        }

        const commentDeleteMatch = poiSubPath.match(/^\/comments\/([^/]+)$/);
        if (method === 'DELETE' && commentDeleteMatch) {
          const commentId = commentDeleteMatch[1];
          const roleCheck = await checkRole();
          if (!roleCheck.allowed) return this.sendError(res, roleCheck.status, roleCheck.message);

          const commentRes = await this.db.execute({
            sql: 'SELECT user_id FROM poi_comments WHERE id = ? AND poi_id = ?',
            args: [commentId, poiId],
          });
          if (commentRes.rows.length === 0) return this.sendError(res, 404, 'Comment not found');

          const isAuthor = commentRes.rows[0].user_id === currentUser.id;
          const isOwner = roleCheck.role === 'OWNER';
          if (!isAuthor && !isOwner) {
            return this.sendError(res, 403, 'Forbidden: Cannot delete other member comments');
          }

          await this.db.execute({
            sql: 'DELETE FROM poi_comments WHERE id = ?',
            args: [commentId],
          });
          return this.sendJson(res, 200, { success: true });
        }
      }

      // 8. Checklists: /api/trips/:tripId/checklists
      if (method === 'POST' && subPath === '/checklists') {
        const roleCheck = await checkRole();
        if (!roleCheck.allowed) return this.sendError(res, roleCheck.status, roleCheck.message);
        if (roleCheck.role === 'VIEWER') {
          return this.sendError(res, 403, 'Forbidden: VIEWER cannot create checklist items');
        }

        const body = await this.readBody(req);
        if (!body.title || !String(body.title).trim()) {
          return this.sendError(res, 400, 'Title is required');
        }

        const itemId = crypto.randomUUID();
        const now = Date.now();
        await this.db.execute({
          sql: `INSERT INTO checklist_items (id, trip_id, title, category, is_completed, assigned_to_user_id, created_at)
                VALUES (?, ?, ?, ?, 0, ?, ?)`,
          args: [itemId, tripId, body.title.trim(), body.category || 'BEFORE_TRIP', body.assignedToUserId || null, now],
        });

        return this.sendJson(res, 201, {
          item: {
            id: itemId,
            tripId,
            title: body.title.trim(),
            category: body.category || 'BEFORE_TRIP',
            isCompleted: false,
            assignedToUserId: body.assignedToUserId || null,
          },
        });
      }

      const checklistMatch = subPath.match(/^\/checklists\/([^/]+)$/);
      if (checklistMatch) {
        const itemId = checklistMatch[1];

        if (method === 'PUT') {
          const roleCheck = await checkRole();
          if (!roleCheck.allowed) return this.sendError(res, roleCheck.status, roleCheck.message);
          if (roleCheck.role === 'VIEWER') {
            return this.sendError(res, 403, 'Forbidden: VIEWER cannot update checklists');
          }

          const body = await this.readBody(req);
          const currentRes = await this.db.execute({
            sql: 'SELECT * FROM checklist_items WHERE id = ? AND trip_id = ?',
            args: [itemId, tripId],
          });
          if (currentRes.rows.length === 0) return this.sendError(res, 404, 'Item not found');
          const curr = currentRes.rows[0];

          await this.db.execute({
            sql: `UPDATE checklist_items SET
                    title = ?, category = ?, is_completed = ?, assigned_to_user_id = ?
                  WHERE id = ? AND trip_id = ?`,
            args: [
              body.title !== undefined ? body.title : curr.title,
              body.category !== undefined ? body.category : curr.category,
              body.isCompleted !== undefined ? (body.isCompleted ? 1 : 0) : curr.is_completed,
              body.assignedToUserId !== undefined ? body.assignedToUserId : curr.assigned_to_user_id,
              itemId,
              tripId,
            ],
          });

          return this.sendJson(res, 200, { success: true });
        }

        if (method === 'DELETE') {
          const roleCheck = await checkRole();
          if (!roleCheck.allowed) return this.sendError(res, roleCheck.status, roleCheck.message);
          if (roleCheck.role === 'VIEWER') {
            return this.sendError(res, 403, 'Forbidden: VIEWER cannot delete checklist items');
          }

          await this.db.execute({
            sql: 'DELETE FROM checklist_items WHERE id = ? AND trip_id = ?',
            args: [itemId, tripId],
          });
          return this.sendJson(res, 200, { success: true });
        }
      }

      // 9. Exports: /api/trips/:tripId/export/...
      if (method === 'GET' && subPath === '/export/json') {
        const roleCheck = await checkRole();
        if (!roleCheck.allowed) return this.sendError(res, roleCheck.status, roleCheck.message);

        const tripRes = await this.db.execute({ sql: 'SELECT * FROM trips WHERE id = ?', args: [tripId] });
        if (tripRes.rows.length === 0) return this.sendError(res, 404, 'Trip not found');
        const trip = tripRes.rows[0];

        const membersRes = await this.db.execute({
          sql: `SELECT u.username, tm.role, u.avatar_color FROM trip_members tm JOIN users u ON tm.user_id = u.id WHERE tm.trip_id = ?`,
          args: [tripId],
        });

        const poisRes = await this.db.execute({
          sql: `SELECT p.*, u.username as paid_by_username FROM pois p LEFT JOIN users u ON p.paid_by_user_id = u.id WHERE p.trip_id = ? ORDER BY p.order_index ASC`,
          args: [tripId],
        });

        const votesRes = await this.db.execute({
          sql: `SELECT p.title as poi_title, u.username FROM poi_votes pv JOIN pois p ON pv.poi_id = p.id JOIN users u ON pv.user_id = u.id WHERE p.trip_id = ?`,
          args: [tripId],
        });

        const commentsRes = await this.db.execute({
          sql: `SELECT p.title as poi_title, u.username as author_username, pc.content, pc.created_at FROM poi_comments pc JOIN pois p ON pc.poi_id = p.id JOIN users u ON pc.user_id = u.id WHERE p.trip_id = ?`,
          args: [tripId],
        });

        const checkRes = await this.db.execute({
          sql: `SELECT ci.title, ci.category, ci.is_completed, u.username as assigned_to_username FROM checklist_items ci LEFT JOIN users u ON ci.assigned_to_user_id = u.id WHERE ci.trip_id = ?`,
          args: [tripId],
        });

        const exportData = {
          version: 1,
          exportedAt: new Date().toISOString(),
          trip: {
            title: trip.title,
            description: trip.description,
            startDate: trip.start_date,
            endDate: trip.end_date,
            currency: trip.currency,
            scratchpad: trip.scratchpad,
          },
          members: membersRes.rows.map((m) => ({ username: m.username, role: m.role, avatarColor: m.avatar_color })),
          pois: poisRes.rows.map((p) => ({
            title: p.title,
            category: p.category,
            status: p.status,
            isMustSee: Boolean(p.is_must_see),
            lat: p.lat,
            lng: p.lng,
            address: p.address,
            dayStart: p.day_start,
            dayEnd: p.day_end,
            orderIndex: p.order_index,
            timeSlot: p.time_slot,
            durationMinutes: p.duration_minutes,
            transportMode: p.transport_mode,
            estimatedCost: p.estimated_cost,
            costType: p.cost_type,
            paidByUsername: p.paid_by_username,
            bookingReference: p.booking_reference,
            externalUrl: p.external_url,
            notes: p.notes,
          })),
          votes: votesRes.rows.map((v) => ({ poiTitle: v.poi_title, username: v.username })),
          comments: commentsRes.rows.map((c) => ({
            poiTitle: c.poi_title,
            authorUsername: c.author_username,
            content: c.content,
            createdAt: c.created_at,
          })),
          checklists: checkRes.rows.map((ci) => ({
            title: ci.title,
            category: ci.category,
            isCompleted: Boolean(ci.is_completed),
            assignedToUsername: ci.assigned_to_username,
          })),
        };

        return this.sendJson(res, 200, exportData);
      }

      if (method === 'GET' && subPath === '/export/gpx') {
        const roleCheck = await checkRole();
        if (!roleCheck.allowed) return this.sendError(res, roleCheck.status, roleCheck.message);

        const tripRes = await this.db.execute({ sql: 'SELECT * FROM trips WHERE id = ?', args: [tripId] });
        if (tripRes.rows.length === 0) return this.sendError(res, 404, 'Trip not found');
        const trip = tripRes.rows[0];

        const poisRes = await this.db.execute({
          sql: 'SELECT * FROM pois WHERE trip_id = ? ORDER BY day_start ASC, order_index ASC',
          args: [tripId],
        });

        let gpx = `<?xml version="1.0" encoding="UTF-8"?>\n`;
        gpx += `<gpx version="1.1" creator="POI Studio - Collaborative Trip Planner" xmlns="http://www.topografix.com/GPX/1/1">\n`;
        gpx += `  <metadata>\n    <name>${escapeXml(trip.title)}</name>\n    <time>${new Date().toISOString()}</time>\n  </metadata>\n`;

        for (const poi of poisRes.rows) {
          gpx += `  <wpt lat="${poi.lat}" lon="${poi.lng}">\n`;
          gpx += `    <name>${escapeXml(poi.title)}</name>\n`;
          gpx += `    <desc>${escapeXml(poi.notes || '')}</desc>\n`;
          gpx += `    <type>${escapeXml(poi.category)}</type>\n`;
          gpx += `  </wpt>\n`;
        }

        // Add daily track
        const dayPois = poisRes.rows.filter((p) => p.day_start !== null);
        if (dayPois.length > 0) {
          gpx += `  <trk>\n    <name>${escapeXml(trip.title)} Route</name>\n    <trkseg>\n`;
          for (const poi of dayPois) {
            gpx += `      <trkpt lat="${poi.lat}" lon="${poi.lng}"><name>${escapeXml(poi.title)}</name></trkpt>\n`;
          }
          gpx += `    </trkseg>\n  </trk>\n`;
        }
        gpx += `</gpx>`;

        res.writeHead(200, {
          'Content-Type': 'application/gpx+xml',
          'Content-Disposition': `attachment; filename="${encodeURIComponent(trip.title)}.gpx"`,
        });
        return res.end(gpx);
      }

      if (method === 'GET' && subPath === '/export/geojson') {
        const roleCheck = await checkRole();
        if (!roleCheck.allowed) return this.sendError(res, roleCheck.status, roleCheck.message);

        const poisRes = await this.db.execute({
          sql: 'SELECT * FROM pois WHERE trip_id = ? ORDER BY order_index ASC',
          args: [tripId],
        });

        const features = poisRes.rows.map((p) => ({
          type: 'Feature',
          geometry: {
            type: 'Point',
            coordinates: [p.lng, p.lat],
          },
          properties: {
            id: p.id,
            title: p.title,
            category: p.category,
            status: p.status,
            dayStart: p.day_start,
            address: p.address,
            estimatedCost: p.estimated_cost,
          },
        }));

        const geojson = {
          type: 'FeatureCollection',
          features,
        };

        res.writeHead(200, {
          'Content-Type': 'application/geo+json',
          'Content-Disposition': `attachment; filename="trip.geojson"`,
        });
        return res.end(JSON.stringify(geojson));
      }

      if (method === 'GET' && subPath === '/export/ics') {
        const roleCheck = await checkRole();
        if (!roleCheck.allowed) return this.sendError(res, roleCheck.status, roleCheck.message);

        const tripRes = await this.db.execute({ sql: 'SELECT * FROM trips WHERE id = ?', args: [tripId] });
        if (tripRes.rows.length === 0) return this.sendError(res, 404, 'Trip not found');
        const trip = tripRes.rows[0];

        const poisRes = await this.db.execute({
          sql: 'SELECT * FROM pois WHERE trip_id = ? AND day_start IS NOT NULL',
          args: [tripId],
        });

        let ics = `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//POI Studio//Collaborative Trip Planner//EN\r\nCALSCALE:GREGORIAN\r\nMETHOD:PUBLISH\r\nX-WR-CALNAME:${escapeIcs(trip.title)}\r\n`;

        const nowIso = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

        for (const p of poisRes.rows) {
          ics += `BEGIN:VEVENT\r\n`;
          ics += `UID:${p.id}@poistudio.local\r\n`;
          ics += `DTSTAMP:${nowIso}\r\n`;

          if (trip.start_date && p.day_start && p.day_start > 0) {
            try {
              const baseDate = new Date(trip.start_date);
              if (!isNaN(baseDate.getTime())) {
                baseDate.setDate(baseDate.getDate() + (p.day_start - 1));
                const year = baseDate.getFullYear();
                const month = String(baseDate.getMonth() + 1).padStart(2, '0');
                const day = String(baseDate.getDate()).padStart(2, '0');

                if (p.time_slot && p.time_slot.includes(':')) {
                  const [hours, minutes] = p.time_slot.split(':');
                  const h = String(parseInt(hours, 10) || 0).padStart(2, '0');
                  const m = String(parseInt(minutes, 10) || 0).padStart(2, '0');
                  const durationMins = p.duration_minutes || 60;

                  const startDt = new Date(baseDate);
                  startDt.setHours(parseInt(h, 10), parseInt(m, 10), 0, 0);

                  const endDt = new Date(startDt.getTime() + durationMins * 60000);
                  const endYear = endDt.getFullYear();
                  const endMonth = String(endDt.getMonth() + 1).padStart(2, '0');
                  const endDay = String(endDt.getDate()).padStart(2, '0');
                  const endH = String(endDt.getHours()).padStart(2, '0');
                  const endM = String(endDt.getMinutes()).padStart(2, '0');

                  ics += `DTSTART:${year}${month}${day}T${h}${m}00\r\n`;
                  ics += `DTEND:${endYear}${endMonth}${endDay}T${endH}${endM}00\r\n`;
                } else {
                  // All-day event: DTEND must be non-inclusive (strictly later than DTSTART per RFC 5545 §3.8.2.2)
                  const endDaysOffset =
                    p.day_end && p.day_end >= p.day_start ? p.day_end : p.day_start;
                  const endBaseDate = new Date(trip.start_date);
                  endBaseDate.setDate(endBaseDate.getDate() + endDaysOffset);
                  const endYear = endBaseDate.getFullYear();
                  const endMonth = String(endBaseDate.getMonth() + 1).padStart(2, '0');
                  const endDay = String(endBaseDate.getDate()).padStart(2, '0');

                  ics += `DTSTART;VALUE=DATE:${year}${month}${day}\r\n`;
                  ics += `DTEND;VALUE=DATE:${endYear}${endMonth}${endDay}\r\n`;
                }
              }
            } catch {}
          }

          ics += `SUMMARY:${escapeIcs(p.title)}\r\n`;
          if (p.address) ics += `LOCATION:${escapeIcs(p.address)}\r\n`;
          ics += `GEO:${p.lat};${p.lng}\r\n`;
          if (p.notes) ics += `DESCRIPTION:${escapeIcs(p.notes)}\r\n`;
          ics += `END:VEVENT\r\n`;
        }

        ics += `END:VCALENDAR\r\n`;

        res.writeHead(200, {
          'Content-Type': 'text/calendar',
          'Content-Disposition': `attachment; filename="trip.ics"`,
        });
        return res.end(ics);
      }
    }

    // --- 3. Import JSON: POST /api/trips/import/json ---
    if (method === 'POST' && pathname === '/api/trips/import/json') {
      if (!currentUser) return this.sendError(res, 401, 'Unauthorized');

      const body = await this.readBody(req);
      if (!body || !body.trip || !body.trip.title) {
        return this.sendError(res, 400, 'Invalid or corrupt backup JSON file');
      }

      const newTripId = crypto.randomUUID();
      const newInviteCode = crypto.randomBytes(5).toString('hex');
      const now = Date.now();

      await this.db.execute({
        sql: `INSERT INTO trips (id, title, description, start_date, end_date, currency, invite_code, scratchpad, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          newTripId,
          body.trip.title,
          body.trip.description || null,
          body.trip.startDate || null,
          body.trip.endDate || null,
          body.trip.currency || '€',
          newInviteCode,
          body.trip.scratchpad || null,
          now,
          now,
        ],
      });

      // Importer becomes OWNER
      await this.db.execute({
        sql: `INSERT INTO trip_members (id, trip_id, user_id, role, joined_at) VALUES (?, ?, ?, 'OWNER', ?)`,
        args: [crypto.randomUUID(), newTripId, currentUser.id, now],
      });

      const resolveUser = async (username) => {
        if (!username || !username.trim()) return currentUser.id;
        const cleanName = username.trim();
        const userRes = await this.db.execute({
          sql: 'SELECT id FROM users WHERE username = ?',
          args: [cleanName],
        });
        if (userRes.rows.length > 0) {
          return userRes.rows[0].id;
        }
        const freshUserId = crypto.randomUUID();
        await this.db.execute({
          sql: `INSERT INTO users (id, username, avatar_color, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
          args: [freshUserId, cleanName, '#6366F1', now, now],
        });
        return freshUserId;
      };

      // Restore POIs
      const poiTitleToId = new Map();
      const poiIdToId = new Map();
      const seenVotePairs = new Set();

      if (Array.isArray(body.pois)) {
        for (const p of body.pois) {
          if (!p || typeof p !== 'object' || !p.title) continue;
          const poiId = crypto.randomUUID();
          if (p.id) poiIdToId.set(String(p.id), poiId);
          poiTitleToId.set(String(p.title).trim(), poiId);

          await this.db.execute({
            sql: `INSERT INTO pois (id, trip_id, title, category, status, is_must_see, lat, lng, address, day_start, day_end, order_index, time_slot, duration_minutes, transport_mode, estimated_cost, cost_type, booking_reference, external_url, notes, created_at, updated_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [
              poiId,
              newTripId,
              p.title,
              p.category || 'OTHER',
              p.status || 'IDEA',
              p.isMustSee ? 1 : 0,
              p.lat,
              p.lng,
              p.address || null,
              p.dayStart !== undefined && p.dayStart !== null ? p.dayStart : null,
              p.dayEnd !== undefined && p.dayEnd !== null ? p.dayEnd : null,
              p.orderIndex || 0,
              p.timeSlot || null,
              p.durationMinutes !== undefined && p.durationMinutes !== null ? p.durationMinutes : null,
              p.transportMode || 'DRIVING',
              p.estimatedCost || 0,
              p.costType || 'TOTAL',
              p.bookingReference || null,
              p.externalUrl || null,
              p.notes || null,
              now,
              now,
            ],
          });

          // Also restore comments attached directly to POI
          if (Array.isArray(p.comments)) {
            for (const c of p.comments) {
              if (!c || !c.content) continue;
              const authorUserId = await resolveUser(
                c.user?.username || c.authorUsername || c.username
              );
              await this.db.execute({
                sql: `INSERT INTO poi_comments (id, poi_id, user_id, content, created_at) VALUES (?, ?, ?, ?, ?)`,
                args: [
                  crypto.randomUUID(),
                  poiId,
                  authorUserId,
                  String(c.content),
                  c.createdAt || now,
                ],
              });
            }
          }

          // Also restore voter names attached directly to POI
          if (Array.isArray(p.voterNames)) {
            for (const voterName of p.voterNames) {
              const voterUserId = await resolveUser(voterName);
              const voteKey = `${poiId}:${voterUserId}`;
              if (!seenVotePairs.has(voteKey)) {
                seenVotePairs.add(voteKey);
                await this.db.execute({
                  sql: `INSERT INTO poi_votes (id, poi_id, user_id, created_at) VALUES (?, ?, ?, ?)`,
                  args: [crypto.randomUUID(), poiId, voterUserId, now],
                });
              }
            }
          }
        }
      }

      // Restore Comments from body.comments
      if (Array.isArray(body.comments)) {
        for (const c of body.comments) {
          if (!c || typeof c !== 'object' || !c.content) continue;
          const targetPoiId =
            (c.poiId && poiIdToId.get(String(c.poiId))) ||
            (c.poiTitle && poiTitleToId.get(String(c.poiTitle).trim()));
          if (!targetPoiId) continue;

          const authorUserId = await resolveUser(c.authorUsername || c.username);
          await this.db.execute({
            sql: `INSERT INTO poi_comments (id, poi_id, user_id, content, created_at) VALUES (?, ?, ?, ?, ?)`,
            args: [
              crypto.randomUUID(),
              targetPoiId,
              authorUserId,
              String(c.content),
              c.createdAt || now,
            ],
          });
        }
      }

      // Restore Votes from body.votes
      if (Array.isArray(body.votes)) {
        for (const v of body.votes) {
          if (!v || typeof v !== 'object') continue;
          const targetPoiId =
            (v.poiId && poiIdToId.get(String(v.poiId))) ||
            (v.poiTitle && poiTitleToId.get(String(v.poiTitle).trim()));
          if (!targetPoiId) continue;

          const voterUserId = await resolveUser(v.username);
          const voteKey = `${targetPoiId}:${voterUserId}`;
          if (!seenVotePairs.has(voteKey)) {
            seenVotePairs.add(voteKey);
            await this.db.execute({
              sql: `INSERT INTO poi_votes (id, poi_id, user_id, created_at) VALUES (?, ?, ?, ?)`,
              args: [crypto.randomUUID(), targetPoiId, voterUserId, v.createdAt || now],
            });
          }
        }
      }

      // Restore Checklists
      if (Array.isArray(body.checklists)) {
        for (const c of body.checklists) {
          if (!c || typeof c !== 'object' || !c.title) continue;
          const assignedUserId = c.assignedToUsername
            ? await resolveUser(c.assignedToUsername)
            : null;
          await this.db.execute({
            sql: `INSERT INTO checklist_items (id, trip_id, title, category, is_completed, assigned_to_user_id, created_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?)`,
            args: [crypto.randomUUID(), newTripId, String(c.title).trim(), c.category || 'BEFORE_TRIP', c.isCompleted ? 1 : 0, assignedUserId, now],
          });
        }
      }

      return this.sendJson(res, 201, { tripId: newTripId });
    }

    // --- 4. Geospatial Proxies (4s timeout) ---

    if (method === 'GET' && pathname === '/api/geo/search') {
      const q = parsedUrl.searchParams.get('q');
      const limit = parseInt(parsedUrl.searchParams.get('limit') || '6', 10);
      if (!q || !q.trim()) return this.sendError(res, 400, 'Search query required');

      // Keyless Komoot Photon search proxy simulation conforming to Photon spec
      const features = [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [2.2945, 48.8584] },
          properties: {
            name: q.trim(),
            street: 'Champ de Mars',
            city: 'Paris',
            country: 'France',
            osm_type: 'W',
            osm_value: 'tourism',
          },
        },
      ];

      return this.sendJson(res, 200, { type: 'FeatureCollection', features: features.slice(0, limit) });
    }

    if (method === 'GET' && pathname === '/api/geo/reverse') {
      const lat = parseFloat(parsedUrl.searchParams.get('lat'));
      const lon = parseFloat(parsedUrl.searchParams.get('lon'));
      if (isNaN(lat) || isNaN(lon)) return this.sendError(res, 400, 'Valid lat and lon required');

      const features = [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [lon, lat] },
          properties: {
            name: `Location at ${lat.toFixed(4)}, ${lon.toFixed(4)}`,
            city: 'Sample City',
            country: 'Sample Country',
          },
        },
      ];
      return this.sendJson(res, 200, { type: 'FeatureCollection', features });
    }

    if (method === 'GET' && pathname === '/api/geo/route') {
      const mode = parsedUrl.searchParams.get('mode') || 'driving';
      const coords = parsedUrl.searchParams.get('coords'); // lon1,lat1;lon2,lat2
      if (!coords) return this.sendError(res, 400, 'Coordinates required');

      const points = coords.split(';').map((pt) => pt.split(',').map(Number));
      if (points.length < 2) return this.sendError(res, 400, 'At least 2 points required');

      let totalDist = 0;
      for (let i = 0; i < points.length - 1; i++) {
        totalDist += haversineDistance(points[i][1], points[i][0], points[i + 1][1], points[i + 1][0]);
      }

      const durationMin = estimateDurationMinutes(totalDist, mode);
      return this.sendJson(res, 200, {
        coordinates: points,
        distanceKm: Math.round(totalDist * 10) / 10,
        durationMin,
        isFallback: false,
      });
    }

    // --- 5. Printable Booklet Route: GET /trips/:tripId/print ---
    const printMatch = pathname.match(/^\/trips\/([^/]+)\/print$/);
    if (method === 'GET' && printMatch) {
      const tripId = printMatch[1];
      const tripRes = await this.db.execute({ sql: 'SELECT * FROM trips WHERE id = ?', args: [tripId] });
      if (tripRes.rows.length === 0) return this.sendError(res, 404, 'Trip not found');
      const trip = tripRes.rows[0];

      const poisRes = await this.db.execute({
        sql: 'SELECT * FROM pois WHERE trip_id = ? ORDER BY day_start ASC, order_index ASC',
        args: [tripId],
      });

      const checkRes = await this.db.execute({
        sql: 'SELECT * FROM checklist_items WHERE trip_id = ?',
        args: [tripId],
      });

      let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeXml(trip.title)} - Booklet</title>`;
      html += `<style>body{font-family:sans-serif;color:#111;padding:2rem;} .no-print{display:none;} .page-break{page-break-before:always;}</style></head><body>`;
      html += `<h1>${escapeXml(trip.title)}</h1><p>${escapeXml(trip.description || '')}</p>`;
      html += `<h2>Dates: ${trip.start_date || 'Flexible'} – ${trip.end_date || 'Flexible'}</h2>`;
      html += `<h3>Itinerary Stops:</h3><ul>`;
      for (const p of poisRes.rows) {
        html += `<li>[Day ${p.day_start || 'Idea'}] ${escapeXml(p.title)} - ${escapeXml(p.address || '')} (${p.lat}, ${p.lng})</li>`;
      }
      html += `</ul><h3>Checklists:</h3><ul>`;
      for (const c of checkRes.rows) {
        html += `<li>[${c.is_completed ? '✔' : ' '}] ${escapeXml(c.title)} (${c.category})</li>`;
      }
      html += `</ul></body></html>`;

      res.writeHead(200, { 'Content-Type': 'text/html' });
      return res.end(html);
    }

    // Default 404
    return this.sendError(res, 404, `Not Found: ${pathname}`);
  }
}

module.exports = {
  ReferenceServer,
};
