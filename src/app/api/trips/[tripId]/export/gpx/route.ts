import { NextResponse } from 'next/server';
import { eq, and, asc } from 'drizzle-orm';
import { db, trips, tripMembers, pois } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';
import { generateGpx } from '@/lib/export';

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

    // Fetch POIs ordered by dayStart and orderIndex
    const tripPois = await db
      .select()
      .from(pois)
      .where(eq(pois.tripId, tripId))
      .orderBy(asc(pois.dayStart), asc(pois.orderIndex), asc(pois.createdAt));

    const gpxContent = generateGpx(
      {
        title: trip.title,
        description: trip.description,
      },
      tripPois.map((p) => ({
        id: p.id,
        title: p.title,
        notes: p.notes,
        category: p.category,
        lat: Number(p.lat),
        lng: Number(p.lng),
        dayStart: p.dayStart,
        orderIndex: p.orderIndex,
      }))
    );

    return new Response(gpxContent, {
      status: 200,
      headers: {
        'Content-Type': 'application/gpx+xml; charset=utf-8',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(trip.title)}.gpx"`,
      },
    });
  } catch (error) {
    console.error('Error exporting trip GPX:', error);
    return NextResponse.json({ error: 'Failed to export GPX' }, { status: 500 });
  }
}
