import { NextResponse } from 'next/server';
import { eq, and, asc } from 'drizzle-orm';
import { db, trips, tripMembers, users, pois, poiVotes, poiComments, checklistItems } from '@/lib/db';
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
      .select({
        role: tripMembers.role,
      })
      .from(tripMembers)
      .where(
        and(eq(tripMembers.tripId, tripId), eq(tripMembers.userId, sessionUser.id))
      )
      .limit(1);

    if (!membership) {
      return NextResponse.json(
        { error: 'You are not a member of this trip' },
        { status: 403 }
      );
    }

    // Fetch members
    const membersList = await db
      .select({
        id: users.id,
        username: users.username,
        avatarColor: users.avatarColor,
        role: tripMembers.role,
      })
      .from(tripMembers)
      .innerJoin(users, eq(tripMembers.userId, users.id))
      .where(eq(tripMembers.tripId, tripId));

    // Fetch POIs with votes and comments
    const rawPois = await db
      .select()
      .from(pois)
      .where(eq(pois.tripId, tripId))
      .orderBy(asc(pois.dayStart), asc(pois.orderIndex), asc(pois.createdAt));

    const memberCount = Math.max(1, membersList.length);
    let plannedPoiCount = 0;
    let ideaPoiCount = 0;
    let totalEstimatedCost = 0;

    const detailedPois = await Promise.all(
      rawPois.map(async (p) => {
        if (p.status === 'IDEA' || p.dayStart === null) {
          ideaPoiCount++;
        } else {
          plannedPoiCount++;
        }
        const multiplier = p.costType === 'PER_PERSON' ? memberCount : 1;
        totalEstimatedCost += Number(p.estimatedCost || 0) * multiplier;

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

    // Fetch checklist items with assigned user
    const rawChecklists = await db
      .select({
        id: checklistItems.id,
        tripId: checklistItems.tripId,
        title: checklistItems.title,
        category: checklistItems.category,
        isCompleted: checklistItems.isCompleted,
        assignedToUserId: checklistItems.assignedToUserId,
        createdAt: checklistItems.createdAt,
        assignedUsername: users.username,
        assignedAvatarColor: users.avatarColor,
      })
      .from(checklistItems)
      .leftJoin(users, eq(checklistItems.assignedToUserId, users.id))
      .where(eq(checklistItems.tripId, tripId))
      .orderBy(asc(checklistItems.createdAt));

    const detailedChecklists = rawChecklists.map((ci) => ({
      id: ci.id,
      tripId: ci.tripId,
      title: ci.title,
      category: ci.category,
      isCompleted: Boolean(ci.isCompleted),
      assignedToUserId: ci.assignedToUserId,
      assignedTo: ci.assignedToUserId
        ? {
            id: ci.assignedToUserId,
            username: ci.assignedUsername || '',
            avatarColor: ci.assignedAvatarColor || '#6366F1',
          }
        : null,
      createdAt: ci.createdAt,
    }));

    return NextResponse.json({
      trip: {
        ...trip,
        role: membership.role as Role,
        currentUserRole: membership.role as Role,
        members: membersList.map((m) => ({
          id: m.id,
          username: m.username,
          avatarColor: m.avatarColor,
          role: m.role as Role,
          user: {
            id: m.id,
            username: m.username,
            avatarColor: m.avatarColor,
          },
        })),
        memberCount: membersList.length,
        plannedPoiCount,
        ideaPoiCount,
        totalEstimatedCost,
        pois: detailedPois,
        checklistItems: detailedChecklists,
      },
    });
  } catch (error) {
    console.error('Error getting trip:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve trip' },
      { status: 500 }
    );
  }
}

export async function PATCH(
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
      .select({
        role: tripMembers.role,
      })
      .from(tripMembers)
      .where(
        and(eq(tripMembers.tripId, tripId), eq(tripMembers.userId, sessionUser.id))
      )
      .limit(1);

    if (!membership) {
      return NextResponse.json(
        { error: 'You are not a member of this trip' },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      );
    }

    const isOwner = membership.role === 'OWNER';
    const isEditorOrOwner = membership.role === 'OWNER' || membership.role === 'EDITOR';

    const metadataFields = ['title', 'description', 'startDate', 'endDate', 'currency'];
    const hasMetadataUpdates = metadataFields.some((field) => field in body);

    if (hasMetadataUpdates && !isOwner) {
      return NextResponse.json(
        { error: 'Only trip owners can modify trip settings' },
        { status: 403 }
      );
    }

    if ('scratchpad' in body && !isEditorOrOwner) {
      return NextResponse.json(
        { error: 'Viewers cannot modify scratchpad' },
        { status: 403 }
      );
    }

    const updates: Partial<typeof trips.$inferInsert> = {};

    if ('title' in body) {
      const title = body.title;
      if (typeof title !== 'string' || title.trim().length === 0) {
        return NextResponse.json(
          { error: 'Trip title cannot be empty' },
          { status: 400 }
        );
      }
      updates.title = title.trim();
    }

    if ('description' in body) {
      updates.description =
        typeof body.description === 'string' ? body.description.trim() : null;
    }

    if ('startDate' in body) {
      updates.startDate =
        typeof body.startDate === 'string' && body.startDate.trim()
          ? body.startDate.trim()
          : null;
    }

    if ('endDate' in body) {
      updates.endDate =
        typeof body.endDate === 'string' && body.endDate.trim()
          ? body.endDate.trim()
          : null;
    }

    if ('currency' in body) {
      const allowed = ['€', '$', '£', 'CHF', '¥'];
      if (allowed.includes(body.currency)) {
        updates.currency = body.currency;
      }
    }

    if ('scratchpad' in body) {
      updates.scratchpad =
        typeof body.scratchpad === 'string' ? body.scratchpad : '';
    }

    updates.updatedAt = Date.now();

    await db.update(trips).set(updates).where(eq(trips.id, tripId));

    const [updatedTrip] = await db
      .select()
      .from(trips)
      .where(eq(trips.id, tripId))
      .limit(1);

    return NextResponse.json({
      success: true,
      trip: updatedTrip,
    });
  } catch (error) {
    console.error('Error updating trip:', error);
    return NextResponse.json(
      { error: 'Failed to update trip' },
      { status: 500 }
    );
  }
}

export async function DELETE(
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
      .select({
        role: tripMembers.role,
      })
      .from(tripMembers)
      .where(
        and(eq(tripMembers.tripId, tripId), eq(tripMembers.userId, sessionUser.id))
      )
      .limit(1);

    if (!membership) {
      return NextResponse.json(
        { error: 'You are not a member of this trip' },
        { status: 403 }
      );
    }

    if (membership.role !== 'OWNER') {
      return NextResponse.json(
        { error: 'Only the trip owner can delete this trip' },
        { status: 403 }
      );
    }

    // Enable foreign keys pragma for cascading delete
    const { client } = await import('@/lib/db');
    await client.execute('PRAGMA foreign_keys = ON;');

    await db.delete(trips).where(eq(trips.id, tripId));

    return NextResponse.json({
      success: true,
      message: 'Trip deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting trip:', error);
    return NextResponse.json(
      { error: 'Failed to delete trip' },
      { status: 500 }
    );
  }
}

export const PUT = PATCH;

