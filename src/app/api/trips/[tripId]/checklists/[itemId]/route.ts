import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db, tripMembers, checklistItems } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ tripId: string; itemId: string }> }
) {
  try {
    const sessionUser = await getSessionUser(req);
    if (!sessionUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { tripId, itemId } = await params;

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
      return NextResponse.json({ error: 'Forbidden: VIEWER cannot update checklists' }, { status: 403 });
    }

    const [curr] = await db
      .select()
      .from(checklistItems)
      .where(and(eq(checklistItems.id, itemId), eq(checklistItems.tripId, tripId)))
      .limit(1);

    if (!curr) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const updates: Partial<typeof checklistItems.$inferInsert> = {};

    if ('title' in body) {
      if (typeof body.title !== 'string' || !body.title.trim()) {
        return NextResponse.json({ error: 'Title cannot be empty' }, { status: 400 });
      }
      updates.title = body.title.trim();
    }

    if ('category' in body) {
      const allowedCategories = ['BEFORE_TRIP', 'PACKING', 'DOCUMENTS'];
      if (typeof body.category === 'string' && allowedCategories.includes(body.category.toUpperCase())) {
        updates.category = body.category.toUpperCase();
      }
    }

    if ('isCompleted' in body) {
      updates.isCompleted = Boolean(body.isCompleted);
    }

    if ('assignedToUserId' in body) {
      updates.assignedToUserId =
        body.assignedToUserId && typeof body.assignedToUserId === 'string'
          ? body.assignedToUserId.trim()
          : null;
    }

    await db
      .update(checklistItems)
      .set(updates)
      .where(and(eq(checklistItems.id, itemId), eq(checklistItems.tripId, tripId)));

    const [updatedItem] = await db
      .select()
      .from(checklistItems)
      .where(and(eq(checklistItems.id, itemId), eq(checklistItems.tripId, tripId)))
      .limit(1);

    return NextResponse.json({ success: true, item: updatedItem });
  } catch (error) {
    console.error('Error updating checklist item:', error);
    return NextResponse.json({ error: 'Failed to update checklist item' }, { status: 500 });
  }
}

export const PUT = PATCH;

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ tripId: string; itemId: string }> }
) {
  try {
    const sessionUser = await getSessionUser(req);
    if (!sessionUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { tripId, itemId } = await params;

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
      return NextResponse.json({ error: 'Forbidden: VIEWER cannot delete checklist items' }, { status: 403 });
    }

    const [curr] = await db
      .select()
      .from(checklistItems)
      .where(and(eq(checklistItems.id, itemId), eq(checklistItems.tripId, tripId)))
      .limit(1);

    if (!curr) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    await db
      .delete(checklistItems)
      .where(and(eq(checklistItems.id, itemId), eq(checklistItems.tripId, tripId)));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting checklist item:', error);
    return NextResponse.json({ error: 'Failed to delete checklist item' }, { status: 500 });
  }
}
