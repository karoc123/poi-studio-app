import { NextResponse } from 'next/server';
import { eq, and, asc } from 'drizzle-orm';
import { db, trips, tripMembers, users, pois, poiVotes, poiComments, checklistItems } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';
import type { TripExportData, Role, PoiCategory, PoiStatus, TransportMode, CostType, ChecklistCategory } from '@/types';

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

    // Check if trip exists
    const [trip] = await db
      .select()
      .from(trips)
      .where(eq(trips.id, tripId))
      .limit(1);

    if (!trip) {
      return NextResponse.json({ error: 'Trip not found' }, { status: 404 });
    }

    // Check membership
    const [membership] = await db
      .select({ role: tripMembers.role })
      .from(tripMembers)
      .where(and(eq(tripMembers.tripId, tripId), eq(tripMembers.userId, sessionUser.id)))
      .limit(1);

    if (!membership) {
      return NextResponse.json({ error: 'You are not a member of this trip' }, { status: 403 });
    }

    // Fetch members
    const membersList = await db
      .select({
        username: users.username,
        role: tripMembers.role,
        avatarColor: users.avatarColor,
      })
      .from(tripMembers)
      .innerJoin(users, eq(tripMembers.userId, users.id))
      .where(eq(tripMembers.tripId, tripId));

    // Fetch POIs
    const rawPois = await db
      .select({
        id: pois.id,
        title: pois.title,
        category: pois.category,
        status: pois.status,
        isMustSee: pois.isMustSee,
        lat: pois.lat,
        lng: pois.lng,
        address: pois.address,
        dayStart: pois.dayStart,
        dayEnd: pois.dayEnd,
        orderIndex: pois.orderIndex,
        timeSlot: pois.timeSlot,
        durationMinutes: pois.durationMinutes,
        transportMode: pois.transportMode,
        estimatedCost: pois.estimatedCost,
        costType: pois.costType,
        paidByUserId: pois.paidByUserId,
        bookingReference: pois.bookingReference,
        externalUrl: pois.externalUrl,
        notes: pois.notes,
        paidByUsername: users.username,
      })
      .from(pois)
      .leftJoin(users, eq(pois.paidByUserId, users.id))
      .where(eq(pois.tripId, tripId))
      .orderBy(asc(pois.orderIndex), asc(pois.createdAt));

    // Fetch Votes
    const votesList = await db
      .select({
        poiTitle: pois.title,
        username: users.username,
      })
      .from(poiVotes)
      .innerJoin(pois, eq(poiVotes.poiId, pois.id))
      .innerJoin(users, eq(poiVotes.userId, users.id))
      .where(eq(pois.tripId, tripId));

    // Fetch Comments
    const commentsList = await db
      .select({
        poiTitle: pois.title,
        authorUsername: users.username,
        content: poiComments.content,
        createdAt: poiComments.createdAt,
      })
      .from(poiComments)
      .innerJoin(pois, eq(poiComments.poiId, pois.id))
      .innerJoin(users, eq(poiComments.userId, users.id))
      .where(eq(pois.tripId, tripId))
      .orderBy(asc(poiComments.createdAt));

    // Fetch Checklists
    const rawChecklists = await db
      .select({
        title: checklistItems.title,
        category: checklistItems.category,
        isCompleted: checklistItems.isCompleted,
        assignedToUsername: users.username,
      })
      .from(checklistItems)
      .leftJoin(users, eq(checklistItems.assignedToUserId, users.id))
      .where(eq(checklistItems.tripId, tripId))
      .orderBy(asc(checklistItems.createdAt));

    const exportPayload: TripExportData = {
      version: 1,
      exportedAt: new Date().toISOString(),
      trip: {
        title: trip.title,
        description: trip.description ?? null,
        startDate: trip.startDate ?? null,
        endDate: trip.endDate ?? null,
        currency: trip.currency,
        scratchpad: trip.scratchpad ?? null,
      },
      members: membersList.map((m) => ({
        username: m.username,
        role: m.role as Role,
        avatarColor: m.avatarColor,
      })),
      pois: rawPois.map((p) => ({
        title: p.title,
        category: p.category as PoiCategory,
        status: p.status as PoiStatus,
        isMustSee: Boolean(p.isMustSee),
        lat: Number(p.lat),
        lng: Number(p.lng),
        address: p.address ?? null,
        dayStart: p.dayStart ?? null,
        dayEnd: p.dayEnd ?? null,
        orderIndex: p.orderIndex ?? 0,
        timeSlot: p.timeSlot ?? null,
        durationMinutes: p.durationMinutes ?? null,
        transportMode: p.transportMode as TransportMode,
        estimatedCost: Number(p.estimatedCost ?? 0),
        costType: p.costType as CostType,
        paidByUsername: p.paidByUsername ?? null,
        bookingReference: p.bookingReference ?? null,
        externalUrl: p.externalUrl ?? null,
        notes: p.notes ?? null,
      })),
      votes: votesList.map((v) => ({
        poiTitle: v.poiTitle,
        username: v.username,
      })),
      comments: commentsList.map((c) => ({
        poiTitle: c.poiTitle,
        authorUsername: c.authorUsername,
        content: c.content,
        createdAt: c.createdAt,
      })),
      checklists: rawChecklists.map((c) => ({
        title: c.title,
        category: c.category as ChecklistCategory,
        isCompleted: Boolean(c.isCompleted),
        assignedToUsername: c.assignedToUsername ?? null,
      })),
    };

    return new Response(JSON.stringify(exportPayload, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(trip.title)}-backup.json"`,
      },
    });
  } catch (error) {
    console.error('Error exporting trip JSON:', error);
    return NextResponse.json({ error: 'Failed to export trip' }, { status: 500 });
  }
}
