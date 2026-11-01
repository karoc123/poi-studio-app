import { NextResponse } from 'next/server';
import { eq, and, asc } from 'drizzle-orm';
import { db, trips, tripMembers, users, pois, poiVotes, poiComments } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';
import type { Role } from '@/types';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ tripId: string }> }
) {
  try {
    const sessionUser = await getSessionUser(req);
    if (!sessionUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { tripId } = await params;

    // Check membership
    const [membership] = await db
      .select({ role: tripMembers.role })
      .from(tripMembers)
      .where(and(eq(tripMembers.tripId, tripId), eq(tripMembers.userId, sessionUser.id)))
      .limit(1);

    if (!membership) {
      return NextResponse.json({ error: 'You are not a member of this trip' }, { status: 403 });
    }

    // Fetch POIs with votes and comments
    const rawPois = await db
      .select()
      .from(pois)
      .where(eq(pois.tripId, tripId))
      .orderBy(asc(pois.dayStart), asc(pois.orderIndex), asc(pois.createdAt));

    const detailedPois = await Promise.all(
      rawPois.map(async (p) => {
        const votes = await db
          .select({
            userId: poiVotes.userId,
            username: users.username,
          })
          .from(poiVotes)
          .innerJoin(users, eq(poiVotes.userId, users.id))
          .where(eq(poiVotes.poiId, p.id));

        const comments = await db
          .select({
            id: poiComments.id,
            content: poiComments.content,
            createdAt: poiComments.createdAt,
            userId: poiComments.userId,
            username: users.username,
            avatarColor: users.avatarColor,
          })
          .from(poiComments)
          .innerJoin(users, eq(poiComments.userId, users.id))
          .where(eq(poiComments.poiId, p.id))
          .orderBy(asc(poiComments.createdAt));

        const voterNames = votes.map((v) => v.username);
        const hasVoted = votes.some((v) => v.userId === sessionUser.id);

        return {
          ...p,
          isMustSee: Boolean(p.isMustSee),
          voteCount: votes.length,
          hasVoted,
          voterNames,
          voters: voterNames,
          comments: comments.map((c) => ({
            id: c.id,
            poiId: p.id,
            content: c.content,
            createdAt: c.createdAt,
            user: {
              id: c.userId,
              username: c.username,
              avatarColor: c.avatarColor,
            },
          })),
        };
      })
    );

    return NextResponse.json({ pois: detailedPois });
  } catch (error) {
    console.error('Error fetching POIs:', error);
    return NextResponse.json({ error: 'Failed to retrieve POIs' }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ tripId: string }> }
) {
  try {
    const sessionUser = await getSessionUser(req);
    if (!sessionUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { tripId } = await params;

    // Check membership and role
    const [membership] = await db
      .select({ role: tripMembers.role })
      .from(tripMembers)
      .where(and(eq(tripMembers.tripId, tripId), eq(tripMembers.userId, sessionUser.id)))
      .limit(1);

    if (!membership) {
      return NextResponse.json({ error: 'You are not a member of this trip' }, { status: 403 });
    }

    if (membership.role === 'VIEWER') {
      return NextResponse.json({ error: 'Forbidden: VIEWER cannot add POIs' }, { status: 403 });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const title = typeof body.title === 'string' ? body.title.trim() : '';
    if (!title) {
      return NextResponse.json({ error: 'POI title is required' }, { status: 400 });
    }

    const lat = Number(body.lat);
    const lng = Number(body.lng);
    if (isNaN(lat) || isNaN(lng)) {
      return NextResponse.json({ error: 'Valid coordinates are required' }, { status: 400 });
    }
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return NextResponse.json({ error: 'Coordinates out of bounds' }, { status: 400 });
    }

    const poiId = crypto.randomUUID();
    const now = Date.now();

    const dayStart =
      body.dayStart !== undefined
        ? body.dayStart !== null ? Number(body.dayStart) : null
        : body.dayNumber !== undefined
        ? body.dayNumber !== null ? Number(body.dayNumber) : null
        : null;

    const dayEnd =
      body.dayEnd !== undefined
        ? body.dayEnd !== null ? Number(body.dayEnd) : null
        : body.accommodationCheckOut !== undefined
        ? body.accommodationCheckOut !== null ? Number(body.accommodationCheckOut) : null
        : null;

    const orderIndex =
      body.orderIndex !== undefined
        ? Number(body.orderIndex)
        : body.sortOrder !== undefined
        ? Number(body.sortOrder)
        : 0;

    const timeSlot =
      typeof body.timeSlot === 'string' && body.timeSlot.trim()
        ? body.timeSlot.trim()
        : typeof body.plannedTime === 'string' && body.plannedTime.trim()
        ? body.plannedTime.trim()
        : null;

    const durationMinutes =
      body.durationMinutes !== undefined && body.durationMinutes !== null
        ? Number(body.durationMinutes)
        : null;

    const estimatedCost =
      body.estimatedCost !== undefined
        ? Number(body.estimatedCost)
        : body.cost !== undefined
        ? Number(body.cost)
        : 0;

    const notes =
      typeof body.notes === 'string' && body.notes.trim()
        ? body.notes.trim()
        : typeof body.description === 'string' && body.description.trim()
        ? body.description.trim()
        : null;

    const address = typeof body.address === 'string' && body.address.trim() ? body.address.trim() : null;
    const category = typeof body.category === 'string' && body.category.trim() ? body.category.trim().toUpperCase() : 'OTHER';
    const status = typeof body.status === 'string' && body.status.trim() ? body.status.trim().toUpperCase() : 'IDEA';
    const transportMode = typeof body.transportMode === 'string' && body.transportMode.trim() ? body.transportMode.trim().toUpperCase() : 'DRIVING';
    const costType = typeof body.costType === 'string' && body.costType.trim() ? body.costType.trim().toUpperCase() : 'TOTAL';
    const isMustSee = Boolean(body.isMustSee);
    const paidByUserId = typeof body.paidByUserId === 'string' ? body.paidByUserId : null;
    const bookingReference = typeof body.bookingReference === 'string' && body.bookingReference.trim() ? body.bookingReference.trim() : null;
    const externalUrl = typeof body.externalUrl === 'string' && body.externalUrl.trim() ? body.externalUrl.trim() : null;

    await db.insert(pois).values({
      id: poiId,
      tripId,
      title,
      category,
      status,
      isMustSee,
      lat,
      lng,
      address,
      dayStart,
      dayEnd,
      orderIndex,
      timeSlot,
      durationMinutes,
      transportMode,
      estimatedCost,
      costType,
      paidByUserId,
      bookingReference,
      externalUrl,
      notes,
      createdAt: now,
      updatedAt: now,
    });

    const createdPoi = {
      id: poiId,
      tripId,
      title,
      category,
      status,
      isMustSee,
      lat,
      lng,
      address,
      dayStart,
      dayEnd,
      orderIndex,
      timeSlot,
      durationMinutes,
      transportMode,
      estimatedCost,
      costType,
      paidByUserId,
      bookingReference,
      externalUrl,
      notes,
      createdAt: now,
      updatedAt: now,
      voteCount: 0,
      hasVoted: false,
      voterNames: [],
      voters: [],
      comments: [],
    };

    return NextResponse.json({ poi: createdPoi }, { status: 201 });
  } catch (error) {
    console.error('Error creating POI:', error);
    return NextResponse.json({ error: 'Failed to create POI' }, { status: 500 });
  }
}
