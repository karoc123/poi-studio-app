import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, trips, tripMembers, users } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';
import { requireRole, PermissionError } from '@/lib/permissions';
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

    // Caller must be a member of the trip (OWNER, EDITOR, or VIEWER)
    await requireRole(tripId, sessionUser.id, ['OWNER', 'EDITOR', 'VIEWER']);

    // Fetch all members with joined user info
    const membersList = await db
      .select({
        id: tripMembers.id,
        tripId: tripMembers.tripId,
        userId: tripMembers.userId,
        role: tripMembers.role,
        joinedAt: tripMembers.joinedAt,
        user: {
          id: users.id,
          username: users.username,
          avatarColor: users.avatarColor,
        },
      })
      .from(tripMembers)
      .innerJoin(users, eq(tripMembers.userId, users.id))
      .where(eq(tripMembers.tripId, tripId));

    return NextResponse.json({
      members: membersList.map((m) => ({
        id: m.id,
        tripId: m.tripId,
        userId: m.userId,
        role: m.role as Role,
        joinedAt: m.joinedAt,
        user: m.user,
      })),
    });
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      );
    }

    console.error('Error fetching trip members:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve trip members' },
      { status: 500 }
    );
  }
}
