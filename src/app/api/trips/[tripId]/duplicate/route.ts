import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db, trips, tripMembers, pois, checklistItems } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';
import { generateInviteCode } from '@/lib/trip-utils';
import type { PoiStatus } from '@/types';

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

    // 1. Fetch original trip
    const [originalTrip] = await db
      .select()
      .from(trips)
      .where(eq(trips.id, tripId))
      .limit(1);

    if (!originalTrip) {
      return NextResponse.json({ error: 'Original trip not found' }, { status: 404 });
    }

    // 2. Check that the requesting user is a member of the trip
    const [membership] = await db
      .select()
      .from(tripMembers)
      .where(
        and(eq(tripMembers.tripId, tripId), eq(tripMembers.userId, sessionUser.id))
      )
      .limit(1);

    if (!membership) {
      return NextResponse.json(
        { error: 'You must be a member of the trip to duplicate it' },
        { status: 403 }
      );
    }

    const now = Date.now();
    const newTripId = crypto.randomUUID();

    // 3. Generate unique invite code for the duplicate
    let newInviteCode = generateInviteCode(10);
    let attempts = 0;
    while (attempts < 5) {
      const [existing] = await db
        .select({ id: trips.id })
        .from(trips)
        .where(eq(trips.inviteCode, newInviteCode))
        .limit(1);

      if (!existing) break;
      newInviteCode = generateInviteCode(10);
      attempts++;
    }

    const duplicateTitle = `${originalTrip.title} (Copy)`;

    // 4. Insert duplicated trip
    await db.insert(trips).values({
      id: newTripId,
      title: duplicateTitle,
      description: originalTrip.description,
      startDate: originalTrip.startDate,
      endDate: originalTrip.endDate,
      currency: originalTrip.currency,
      inviteCode: newInviteCode,
      scratchpad: originalTrip.scratchpad,
      createdAt: now,
      updatedAt: now,
    });

    // 5. Current user becomes sole member with OWNER role
    await db.insert(tripMembers).values({
      id: crypto.randomUUID(),
      tripId: newTripId,
      userId: sessionUser.id,
      role: 'OWNER',
      joinedAt: now,
    });

    // 6. Clone all POIs (resetting votes and booking statuses)
    const originalPois = await db
      .select()
      .from(pois)
      .where(eq(pois.tripId, tripId));

    if (originalPois.length > 0) {
      const newPois = originalPois.map((p) => {
        // Reset BOOKED status to PLANNED in template mode
        const resetStatus: PoiStatus = p.status === 'BOOKED' ? 'PLANNED' : (p.status as PoiStatus);

        return {
          id: crypto.randomUUID(),
          tripId: newTripId,
          title: p.title,
          category: p.category,
          status: resetStatus,
          isMustSee: p.isMustSee,
          lat: p.lat,
          lng: p.lng,
          address: p.address,
          dayStart: p.dayStart,
          dayEnd: p.dayEnd,
          orderIndex: p.orderIndex,
          timeSlot: p.timeSlot,
          durationMinutes: p.durationMinutes,
          transportMode: p.transportMode,
          estimatedCost: p.estimatedCost,
          costType: p.costType,
          paidByUserId: null,
          bookingReference: null,
          externalUrl: p.externalUrl,
          notes: p.notes,
          createdAt: now,
          updatedAt: now,
        };
      });

      await db.insert(pois).values(newPois);
    }

    // 7. Clone all checklist items (resetting completion and assignment)
    const originalChecklists = await db
      .select()
      .from(checklistItems)
      .where(eq(checklistItems.tripId, tripId));

    if (originalChecklists.length > 0) {
      const newChecklistItems = originalChecklists.map((c) => ({
        id: crypto.randomUUID(),
        tripId: newTripId,
        title: c.title,
        category: c.category,
        isCompleted: false,
        assignedToUserId: null,
        createdAt: now,
      }));

      await db.insert(checklistItems).values(newChecklistItems);
    }

    const [createdDuplicate] = await db
      .select()
      .from(trips)
      .where(eq(trips.id, newTripId))
      .limit(1);

    return NextResponse.json(
      {
        success: true,
        trip: {
          ...createdDuplicate,
          role: 'OWNER',
          memberCount: 1,
          plannedPoiCount: originalPois.filter((p) => p.status !== 'IDEA').length,
          ideaPoiCount: originalPois.filter((p) => p.status === 'IDEA').length,
          totalEstimatedCost: originalPois.reduce(
            (sum, p) => sum + Number(p.estimatedCost || 0),
            0
          ),
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
    console.error('Error duplicating trip:', error);
    return NextResponse.json(
      { error: 'Failed to duplicate trip' },
      { status: 500 }
    );
  }
}
