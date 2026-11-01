import { NextResponse } from 'next/server';
import { eq, inArray, desc } from 'drizzle-orm';
import { db, trips, tripMembers, users, pois } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';
import { generateInviteCode } from '@/lib/trip-utils';
import type { Role } from '@/types';

export async function GET(req: Request) {
  try {
    const sessionUser = await getSessionUser(req);
    if (!sessionUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    // 1. Find all memberships for the current user
    const userMemberships = await db
      .select({
        tripId: tripMembers.tripId,
        role: tripMembers.role,
      })
      .from(tripMembers)
      .where(eq(tripMembers.userId, sessionUser.id));

    if (userMemberships.length === 0) {
      return NextResponse.json({ trips: [] });
    }

    const tripIds = userMemberships.map((m) => m.tripId);
    const roleMap = new Map<string, Role>(
      userMemberships.map((m) => [m.tripId, m.role as Role])
    );

    // 2. Fetch trip records
    const tripRecords = await db
      .select()
      .from(trips)
      .where(inArray(trips.id, tripIds))
      .orderBy(desc(trips.updatedAt));

    // 3. Fetch all members for these trips
    const allMembers = await db
      .select({
        tripId: tripMembers.tripId,
        userId: users.id,
        username: users.username,
        avatarColor: users.avatarColor,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
        role: tripMembers.role,
      })
      .from(tripMembers)
      .innerJoin(users, eq(tripMembers.userId, users.id))
      .where(inArray(tripMembers.tripId, tripIds));

    const membersByTrip = new Map<string, typeof allMembers>();
    for (const member of allMembers) {
      const list = membersByTrip.get(member.tripId) || [];
      list.push(member);
      membersByTrip.set(member.tripId, list);
    }

    // 4. Fetch all POIs for these trips to aggregate counts & cost
    const allPois = await db
      .select({
        tripId: pois.tripId,
        status: pois.status,
        estimatedCost: pois.estimatedCost,
      })
      .from(pois)
      .where(inArray(pois.tripId, tripIds));

    const poisByTrip = new Map<
      string,
      { plannedCount: number; ideaCount: number; totalCost: number }
    >();

    for (const poi of allPois) {
      const stats = poisByTrip.get(poi.tripId) || {
        plannedCount: 0,
        ideaCount: 0,
        totalCost: 0,
      };

      if (poi.status === 'IDEA') {
        stats.ideaCount += 1;
      } else {
        stats.plannedCount += 1;
      }

      stats.totalCost += Number(poi.estimatedCost || 0);
      poisByTrip.set(poi.tripId, stats);
    }

    // 5. Assemble enriched trip card data
    const enrichedTrips = tripRecords.map((t) => {
      const tripMemberList = membersByTrip.get(t.id) || [];
      const stats = poisByTrip.get(t.id) || {
        plannedCount: 0,
        ideaCount: 0,
        totalCost: 0,
      };

      return {
        ...t,
        role: roleMap.get(t.id) || 'VIEWER',
        members: tripMemberList.map((m) => ({
          id: m.userId,
          username: m.username,
          avatarColor: m.avatarColor,
          createdAt: m.createdAt,
          updatedAt: m.updatedAt,
          role: m.role as Role,
        })),
        memberCount: tripMemberList.length,
        plannedPoiCount: stats.plannedCount,
        ideaPoiCount: stats.ideaCount,
        totalEstimatedCost: stats.totalCost,
      };
    });

    return NextResponse.json({ trips: enrichedTrips });
  } catch (error) {
    console.error('Error fetching trips:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve trips' },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const sessionUser = await getSessionUser(req);
    if (!sessionUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      );
    }

    const { title, description, startDate, endDate, currency, scratchpad } = body;

    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return NextResponse.json(
        { error: 'Trip title is required' },
        { status: 400 }
      );
    }

    if (title.trim().length > 100) {
      return NextResponse.json(
        { error: 'Trip title must be 100 characters or less' },
        { status: 400 }
      );
    }

    const tripId = crypto.randomUUID();
    const now = Date.now();

    // Generate unique 10-char invite code
    let inviteCode = generateInviteCode(10);
    let attempts = 0;
    while (attempts < 5) {
      const [existing] = await db
        .select({ id: trips.id })
        .from(trips)
        .where(eq(trips.inviteCode, inviteCode))
        .limit(1);

      if (!existing) break;
      inviteCode = generateInviteCode(10);
      attempts++;
    }

    const allowedCurrencies = ['€', '$', '£', 'CHF', '¥'];
    const selectedCurrency =
      typeof currency === 'string' && allowedCurrencies.includes(currency)
        ? currency
        : '€';

    // Insert new trip
    await db.insert(trips).values({
      id: tripId,
      title: title.trim(),
      description: typeof description === 'string' ? description.trim() : null,
      startDate: typeof startDate === 'string' && startDate.trim() ? startDate.trim() : null,
      endDate: typeof endDate === 'string' && endDate.trim() ? endDate.trim() : null,
      currency: selectedCurrency,
      inviteCode,
      scratchpad: typeof scratchpad === 'string' ? scratchpad : '',
      createdAt: now,
      updatedAt: now,
    });

    // Create OWNER membership for the creating user
    await db.insert(tripMembers).values({
      id: crypto.randomUUID(),
      tripId,
      userId: sessionUser.id,
      role: 'OWNER',
      joinedAt: now,
    });

    const [createdTrip] = await db
      .select()
      .from(trips)
      .where(eq(trips.id, tripId))
      .limit(1);

    return NextResponse.json(
      {
        success: true,
        trip: {
          ...createdTrip,
          role: 'OWNER',
          memberCount: 1,
          plannedPoiCount: 0,
          ideaPoiCount: 0,
          totalEstimatedCost: 0,
          members: [
            {
              id: sessionUser.id,
              username: sessionUser.username,
              avatarColor: sessionUser.avatarColor,
              role: 'OWNER',
            },
          ],
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error creating trip:', error);
    return NextResponse.json(
      { error: 'Failed to create trip' },
      { status: 500 }
    );
  }
}
