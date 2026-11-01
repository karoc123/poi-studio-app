import { NextResponse } from 'next/server';
import { eq, and, or, lte, gte, isNull } from 'drizzle-orm';
import { db, tripMembers, pois } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';
import { optimizeDayStops } from '@/lib/algorithms/tsp';

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
      return NextResponse.json({ error: 'Forbidden: VIEWER cannot optimize routes' }, { status: 403 });
    }

    const body = await req.json().catch(() => null);
    if (!body || body.day === undefined || isNaN(Number(body.day))) {
      return NextResponse.json({ error: 'Valid day number required' }, { status: 400 });
    }

    const day = Number(body.day);

    // Fetch all POIs on this day, including multi-day accommodations covering this day
    const allPois = await db
      .select()
      .from(pois)
      .where(
        and(
          eq(pois.tripId, tripId),
          or(
            eq(pois.dayStart, day),
            and(
              eq(pois.category, 'ACCOMMODATION'),
              lte(pois.dayStart, day),
              or(isNull(pois.dayEnd), gte(pois.dayEnd, day))
            )
          )
        )
      );

    const stops = allPois.map((p) => ({
      ...p,
      lat: Number(p.lat),
      lng: Number(p.lng),
      orderIndex: Number(p.orderIndex),
    }));

    const optimized = optimizeDayStops(stops, day);

    const now = Date.now();
    for (const opt of optimized) {
      await db
        .update(pois)
        .set({ orderIndex: opt.orderIndex, updatedAt: now })
        .where(and(eq(pois.id, opt.id), eq(pois.tripId, tripId)));
    }

    return NextResponse.json({ success: true, pois: optimized });
  } catch (error) {
    console.error('Error optimizing day route:', error);
    return NextResponse.json({ error: 'Failed to optimize day route' }, { status: 500 });
  }
}
