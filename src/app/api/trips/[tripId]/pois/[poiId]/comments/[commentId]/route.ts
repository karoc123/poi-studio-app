import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db, tripMembers, poiComments } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ tripId: string; poiId: string; commentId: string }> }
) {
  try {
    const sessionUser = await getSessionUser(req);
    if (!sessionUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { tripId, poiId, commentId } = await params;

    // Check membership and role
    const [membership] = await db
      .select({ role: tripMembers.role })
      .from(tripMembers)
      .where(and(eq(tripMembers.tripId, tripId), eq(tripMembers.userId, sessionUser.id)))
      .limit(1);

    if (!membership) {
      return NextResponse.json({ error: 'You are not a member of this trip' }, { status: 403 });
    }

    // Check comment exists and belongs to this POI
    const [comment] = await db
      .select()
      .from(poiComments)
      .where(and(eq(poiComments.id, commentId), eq(poiComments.poiId, poiId)))
      .limit(1);

    if (!comment) {
      return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
    }

    const isAuthor = comment.userId === sessionUser.id;
    const isOwner = membership.role === 'OWNER';

    if (!isAuthor && !isOwner) {
      return NextResponse.json(
        { error: 'Forbidden: Cannot delete other member comments' },
        { status: 403 }
      );
    }

    await db.delete(poiComments).where(eq(poiComments.id, commentId));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting comment:', error);
    return NextResponse.json({ error: 'Failed to delete comment' }, { status: 500 });
  }
}
