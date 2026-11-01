import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db, tripMembers, pois, poiVotes, users } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ tripId: string; poiId: string }> }
) {
  try {
    const sessionUser = await getSessionUser(req);
    if (!sessionUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { tripId, poiId } = await params;

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
      return NextResponse.json({ error: 'Forbidden: VIEWER cannot vote' }, { status: 403 });
    }

    // Check POI exists
    const [poi] = await db
      .select({ id: pois.id })
      .from(pois)
      .where(and(eq(pois.id, poiId), eq(pois.tripId, tripId)))
      .limit(1);

    if (!poi) {
      return NextResponse.json({ error: 'POI not found' }, { status: 404 });
    }

    // Toggle vote
    const [existingVote] = await db
      .select()
      .from(poiVotes)
      .where(and(eq(poiVotes.poiId, poiId), eq(poiVotes.userId, sessionUser.id)))
      .limit(1);

    let voted: boolean;
    if (existingVote) {
      await db.delete(poiVotes).where(eq(poiVotes.id, existingVote.id));
      voted = false;
    } else {
      await db.insert(poiVotes).values({
        id: crypto.randomUUID(),
        poiId,
        userId: sessionUser.id,
        createdAt: Date.now(),
      });
      voted = true;
    }

    // Fetch updated voter list
    const votes = await db
      .select({ username: users.username })
      .from(poiVotes)
      .innerJoin(users, eq(poiVotes.userId, users.id))
      .where(eq(poiVotes.poiId, poiId));

    const voters = votes.map((v) => v.username);

    return NextResponse.json({
      voted,
      voteCount: voters.length,
      voters,
      voterNames: voters,
    });
  } catch (error) {
    console.error('Error toggling vote:', error);
    return NextResponse.json({ error: 'Failed to toggle vote' }, { status: 500 });
  }
}
