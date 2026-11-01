import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db, tripMembers, pois } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';

export async function PATCH(
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
      return NextResponse.json({ error: 'Forbidden: VIEWER cannot update POIs' }, { status: 403 });
    }

    // Check POI exists
    const [curr] = await db
      .select()
      .from(pois)
      .where(and(eq(pois.id, poiId), eq(pois.tripId, tripId)))
      .limit(1);

    if (!curr) {
      return NextResponse.json({ error: 'POI not found' }, { status: 404 });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const updates: Partial<typeof pois.$inferInsert> = {};

    if ('title' in body) {
      if (typeof body.title !== 'string' || !body.title.trim()) {
        return NextResponse.json({ error: 'POI title cannot be empty' }, { status: 400 });
      }
      updates.title = body.title.trim();
    }

    if ('category' in body) {
      updates.category = typeof body.category === 'string' ? body.category.trim().toUpperCase() : 'OTHER';
    }

    if ('status' in body) {
      updates.status = typeof body.status === 'string' ? body.status.trim().toUpperCase() : 'IDEA';
    }

    if ('isMustSee' in body) {
      updates.isMustSee = Boolean(body.isMustSee);
    }

    if ('lat' in body) {
      const lat = Number(body.lat);
      if (isNaN(lat) || lat < -90 || lat > 90) {
        return NextResponse.json({ error: 'Invalid latitude' }, { status: 400 });
      }
      updates.lat = lat;
    }

    if ('lng' in body) {
      const lng = Number(body.lng);
      if (isNaN(lng) || lng < -180 || lng > 180) {
        return NextResponse.json({ error: 'Invalid longitude' }, { status: 400 });
      }
      updates.lng = lng;
    }

    if ('address' in body) {
      updates.address = typeof body.address === 'string' && body.address.trim() ? body.address.trim() : null;
    }

    if ('dayStart' in body || 'dayNumber' in body) {
      const d = 'dayStart' in body ? body.dayStart : body.dayNumber;
      updates.dayStart = d !== null && d !== undefined ? Number(d) : null;
    }

    if ('dayEnd' in body || 'accommodationCheckOut' in body) {
      const d = 'dayEnd' in body ? body.dayEnd : body.accommodationCheckOut;
      updates.dayEnd = d !== null && d !== undefined ? Number(d) : null;
    }

    if ('orderIndex' in body || 'sortOrder' in body) {
      const o = 'orderIndex' in body ? body.orderIndex : body.sortOrder;
      updates.orderIndex = o !== null && o !== undefined ? Number(o) : 0;
    }

    if ('timeSlot' in body || 'plannedTime' in body) {
      const t = 'timeSlot' in body ? body.timeSlot : body.plannedTime;
      updates.timeSlot = typeof t === 'string' && t.trim() ? t.trim() : null;
    }

    if ('durationMinutes' in body) {
      updates.durationMinutes = body.durationMinutes !== null && body.durationMinutes !== undefined ? Number(body.durationMinutes) : null;
    }

    if ('transportMode' in body) {
      updates.transportMode = typeof body.transportMode === 'string' ? body.transportMode.trim().toUpperCase() : 'DRIVING';
    }

    if ('estimatedCost' in body || 'cost' in body) {
      const c = 'estimatedCost' in body ? body.estimatedCost : body.cost;
      updates.estimatedCost = c !== null && c !== undefined ? Number(c) : 0;
    }

    if ('costType' in body) {
      updates.costType = typeof body.costType === 'string' ? body.costType.trim().toUpperCase() : 'TOTAL';
    }

    if ('paidByUserId' in body) {
      updates.paidByUserId = typeof body.paidByUserId === 'string' ? body.paidByUserId : null;
    }

    if ('bookingReference' in body) {
      updates.bookingReference = typeof body.bookingReference === 'string' && body.bookingReference.trim() ? body.bookingReference.trim() : null;
    }

    if ('externalUrl' in body) {
      updates.externalUrl = typeof body.externalUrl === 'string' && body.externalUrl.trim() ? body.externalUrl.trim() : null;
    }

    if ('notes' in body || 'description' in body) {
      const n = 'notes' in body ? body.notes : body.description;
      updates.notes = typeof n === 'string' && n.trim() ? n.trim() : null;
    }

    updates.updatedAt = Date.now();

    await db.update(pois).set(updates).where(and(eq(pois.id, poiId), eq(pois.tripId, tripId)));

    const [updatedPoi] = await db
      .select()
      .from(pois)
      .where(and(eq(pois.id, poiId), eq(pois.tripId, tripId)))
      .limit(1);

    return NextResponse.json({ success: true, poiId, poi: updatedPoi });
  } catch (error) {
    console.error('Error updating POI:', error);
    return NextResponse.json({ error: 'Failed to update POI' }, { status: 500 });
  }
}

export const PUT = PATCH;

export async function DELETE(
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
      return NextResponse.json({ error: 'Forbidden: VIEWER cannot delete POIs' }, { status: 403 });
    }

    const [curr] = await db
      .select()
      .from(pois)
      .where(and(eq(pois.id, poiId), eq(pois.tripId, tripId)))
      .limit(1);

    if (!curr) {
      return NextResponse.json({ error: 'POI not found' }, { status: 404 });
    }

    await db.delete(pois).where(and(eq(pois.id, poiId), eq(pois.tripId, tripId)));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting POI:', error);
    return NextResponse.json({ error: 'Failed to delete POI' }, { status: 500 });
  }
}
