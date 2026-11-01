import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db, trips, tripMembers, pois, checklistItems, poiVotes, poiComments, users } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';
import type { PoiCategory, PoiStatus, TransportMode, CostType, ChecklistCategory } from '@/types';

async function resolveUser(
  username: string | null | undefined,
  fallbackUserId: string
): Promise<string> {
  if (!username || !username.trim()) {
    return fallbackUserId;
  }
  const cleanUsername = username.trim();
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, cleanUsername))
    .limit(1);

  if (existing) {
    return existing.id;
  }

  const freshId = crypto.randomUUID();
  const now = Date.now();
  try {
    await db.insert(users).values({
      id: freshId,
      username: cleanUsername,
      avatarColor: '#6366F1',
      createdAt: now,
      updatedAt: now,
    });
    return freshId;
  } catch {
    const [retry] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, cleanUsername))
      .limit(1);
    return retry ? retry.id : fallbackUserId;
  }
}

export async function POST(req: Request) {
  try {
    const sessionUser = await getSessionUser(req);
    if (!sessionUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await req.json().catch(() => null);

    // Validate incoming backup schema
    if (
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body) ||
      body.version !== 1 ||
      !body.trip ||
      typeof body.trip !== 'object' ||
      typeof body.trip.title !== 'string' ||
      body.trip.title.trim().length === 0
    ) {
      return NextResponse.json(
        { error: 'Invalid or corrupt backup JSON file' },
        { status: 400 }
      );
    }

    const newTripId = crypto.randomUUID();
    const newInviteCode = crypto.randomBytes(5).toString('hex');
    const now = Date.now();

    // 1. Insert new trip
    await db.insert(trips).values({
      id: newTripId,
      title: body.trip.title.trim(),
      description: body.trip.description ? String(body.trip.description).trim() : null,
      startDate: body.trip.startDate ? String(body.trip.startDate).trim() : null,
      endDate: body.trip.endDate ? String(body.trip.endDate).trim() : null,
      currency: body.trip.currency || '€',
      inviteCode: newInviteCode,
      scratchpad: body.trip.scratchpad ? String(body.trip.scratchpad) : null,
      createdAt: now,
      updatedAt: now,
    });

    // 2. Assign current user as OWNER
    await db.insert(tripMembers).values({
      id: crypto.randomUUID(),
      tripId: newTripId,
      userId: sessionUser.id,
      role: 'OWNER',
      joinedAt: now,
    });

    // 3. Restore POIs with fresh IDs
    const poiIdMap = new Map<string, string>();
    const seenVoteKeys = new Set<string>();

    if (Array.isArray(body.pois)) {
      for (const p of body.pois) {
        if (!p || typeof p !== 'object' || !p.title) continue;
        const freshPoiId = crypto.randomUUID();

        if (p.id) {
          poiIdMap.set(String(p.id), freshPoiId);
        }
        poiIdMap.set(String(p.title).trim(), freshPoiId);

        await db.insert(pois).values({
          id: freshPoiId,
          tripId: newTripId,
          title: String(p.title).trim(),
          category: (p.category || 'OTHER') as PoiCategory,
          status: (p.status || 'IDEA') as PoiStatus,
          isMustSee: Boolean(p.isMustSee),
          lat: Number(p.lat) || 0,
          lng: Number(p.lng) || 0,
          address: p.address ? String(p.address).trim() : null,
          dayStart: p.dayStart !== undefined && p.dayStart !== null ? Number(p.dayStart) : null,
          dayEnd: p.dayEnd !== undefined && p.dayEnd !== null ? Number(p.dayEnd) : null,
          orderIndex: Number(p.orderIndex) || 0,
          timeSlot: p.timeSlot ? String(p.timeSlot).trim() : null,
          durationMinutes: p.durationMinutes !== undefined && p.durationMinutes !== null ? Number(p.durationMinutes) : null,
          transportMode: (p.transportMode || 'DRIVING') as TransportMode,
          estimatedCost: Number(p.estimatedCost) || 0,
          costType: (p.costType || 'TOTAL') as CostType,
          bookingReference: p.bookingReference ? String(p.bookingReference).trim() : null,
          externalUrl: p.externalUrl ? String(p.externalUrl).trim() : null,
          notes: p.notes ? String(p.notes) : null,
          createdAt: now,
          updatedAt: now,
        });

        // Restore nested comments on POI if present
        if (Array.isArray(p.comments)) {
          for (const c of p.comments) {
            if (!c || !c.content) continue;
            const authorUserId = await resolveUser(
              c.user?.username || c.authorUsername || c.username,
              sessionUser.id
            );
            await db.insert(poiComments).values({
              id: crypto.randomUUID(),
              poiId: freshPoiId,
              userId: authorUserId,
              content: String(c.content).trim(),
              createdAt: c.createdAt ? Number(c.createdAt) : now,
            });
          }
        }

        // Restore nested votes on POI if present
        if (Array.isArray(p.voterNames)) {
          for (const voterName of p.voterNames) {
            const voterUserId = await resolveUser(voterName, sessionUser.id);
            const key = `${freshPoiId}:${voterUserId}`;
            if (!seenVoteKeys.has(key)) {
              seenVoteKeys.add(key);
              await db.insert(poiVotes).values({
                id: crypto.randomUUID(),
                poiId: freshPoiId,
                userId: voterUserId,
                createdAt: now,
              });
            }
          }
        }
      }
    }

    // 4. Restore Comments from body.comments
    if (Array.isArray(body.comments)) {
      for (const c of body.comments) {
        if (!c || typeof c !== 'object' || !c.content) continue;
        const targetPoiId =
          (c.poiId && poiIdMap.get(String(c.poiId))) ||
          (c.poiTitle && poiIdMap.get(String(c.poiTitle).trim()));
        if (!targetPoiId) continue;

        const authorUserId = await resolveUser(
          c.authorUsername || c.username,
          sessionUser.id
        );

        await db.insert(poiComments).values({
          id: crypto.randomUUID(),
          poiId: targetPoiId,
          userId: authorUserId,
          content: String(c.content).trim(),
          createdAt: c.createdAt ? Number(c.createdAt) : now,
        });
      }
    }

    // 5. Restore Votes from body.votes
    if (Array.isArray(body.votes)) {
      for (const v of body.votes) {
        if (!v || typeof v !== 'object') continue;
        const targetPoiId =
          (v.poiId && poiIdMap.get(String(v.poiId))) ||
          (v.poiTitle && poiIdMap.get(String(v.poiTitle).trim()));
        if (!targetPoiId) continue;

        const voterUserId = await resolveUser(
          v.username,
          sessionUser.id
        );

        const key = `${targetPoiId}:${voterUserId}`;
        if (!seenVoteKeys.has(key)) {
          seenVoteKeys.add(key);
          await db.insert(poiVotes).values({
            id: crypto.randomUUID(),
            poiId: targetPoiId,
            userId: voterUserId,
            createdAt: v.createdAt ? Number(v.createdAt) : now,
          });
        }
      }
    }

    // 6. Restore Checklists with fresh IDs
    if (Array.isArray(body.checklists)) {
      for (const c of body.checklists) {
        if (!c || typeof c !== 'object' || !c.title) continue;
        const freshChecklistId = crypto.randomUUID();
        const assignedUserId = c.assignedToUsername
          ? await resolveUser(c.assignedToUsername, sessionUser.id)
          : null;

        await db.insert(checklistItems).values({
          id: freshChecklistId,
          tripId: newTripId,
          title: String(c.title).trim(),
          category: (c.category || 'BEFORE_TRIP') as ChecklistCategory,
          isCompleted: Boolean(c.isCompleted),
          assignedToUserId: assignedUserId,
          createdAt: now,
        });
      }
    }

    return NextResponse.json(
      {
        success: true,
        tripId: newTripId,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error importing trip JSON:', error);
    return NextResponse.json({ error: 'Failed to import trip' }, { status: 500 });
  }
}
