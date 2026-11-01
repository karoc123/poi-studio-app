import { NextResponse } from 'next/server';
import { eq, and, asc } from 'drizzle-orm';
import { db, tripMembers, pois, poiComments, users } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ tripId: string; poiId: string }> }
) {
  try {
    const sessionUser = await getSessionUser(req);
    if (!sessionUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { tripId, poiId } = await params;

    // Check membership
    const [membership] = await db
      .select({ role: tripMembers.role })
      .from(tripMembers)
      .where(and(eq(tripMembers.tripId, tripId), eq(tripMembers.userId, sessionUser.id)))
      .limit(1);

    if (!membership) {
      return NextResponse.json({ error: 'You are not a member of this trip' }, { status: 403 });
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

    const comments = await db
      .select({
        id: poiComments.id,
        poiId: poiComments.poiId,
        content: poiComments.content,
        createdAt: poiComments.createdAt,
        userId: users.id,
        username: users.username,
        avatarColor: users.avatarColor,
      })
      .from(poiComments)
      .innerJoin(users, eq(poiComments.userId, users.id))
      .where(eq(poiComments.poiId, poiId))
      .orderBy(asc(poiComments.createdAt));

    return NextResponse.json({
      comments: comments.map((c) => ({
        id: c.id,
        poiId: c.poiId,
        content: c.content,
        createdAt: c.createdAt,
        user: {
          id: c.userId,
          username: c.username,
          avatarColor: c.avatarColor,
        },
      })),
    });
  } catch (error) {
    console.error('Error fetching comments:', error);
    return NextResponse.json({ error: 'Failed to retrieve comments' }, { status: 500 });
  }
}

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
      return NextResponse.json({ error: 'Forbidden: VIEWER cannot post comments' }, { status: 403 });
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

    const body = await req.json().catch(() => null);
    if (!body || !body.content || !String(body.content).trim()) {
      return NextResponse.json({ error: 'Comment content cannot be empty' }, { status: 400 });
    }

    const content = String(body.content).trim();
    const commentId = crypto.randomUUID();
    const now = Date.now();

    await db.insert(poiComments).values({
      id: commentId,
      poiId,
      userId: sessionUser.id,
      content,
      createdAt: now,
    });

    return NextResponse.json(
      {
        comment: {
          id: commentId,
          poiId,
          content,
          createdAt: now,
          user: {
            id: sessionUser.id,
            username: sessionUser.username,
            avatarColor: sessionUser.avatarColor,
          },
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error creating comment:', error);
    return NextResponse.json({ error: 'Failed to post comment' }, { status: 500 });
  }
}
