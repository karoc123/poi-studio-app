import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db, tripMembers, pois } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';

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
      return NextResponse.json({ error: 'Forbidden: VIEWER cannot reorder POIs' }, { status: 403 });
    }

    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const items: Array<{ id: string; orderIndex?: number; sortOrder?: number; dayStart?: number | null; dayNumber?: number | null }> =
      Array.isArray(body) ? body : Array.isArray(body.items) ? body.items : [];

    const now = Date.now();
    for (const item of items) {
      if (!item.id) continue;
      const orderIndex =
        item.orderIndex !== undefined
          ? Number(item.orderIndex)
          : item.sortOrder !== undefined
          ? Number(item.sortOrder)
          : 0;

      const updateData: { orderIndex: number; updatedAt: number; dayStart?: number | null } = {
        orderIndex,
        updatedAt: now,
      };

      if ('dayStart' in item) {
        updateData.dayStart = item.dayStart !== null && item.dayStart !== undefined ? Number(item.dayStart) : null;
      } else if ('dayNumber' in item) {
        updateData.dayStart = item.dayNumber !== null && item.dayNumber !== undefined ? Number(item.dayNumber) : null;
      }

      await db
        .update(pois)
        .set(updateData)
        .where(and(eq(pois.id, item.id), eq(pois.tripId, tripId)));
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error reordering POIs:', error);
    return NextResponse.json({ error: 'Failed to reorder POIs' }, { status: 500 });
  }
}
