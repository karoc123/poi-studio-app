import { NextResponse } from 'next/server';
import { eq, and, asc } from 'drizzle-orm';
import { db, trips, tripMembers, pois } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';
import { generateGeoJson } from '@/lib/export';

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

    // Fetch POIs
    const tripPois = await db
      .select()
      .from(pois)
      .where(eq(pois.tripId, tripId))
      .orderBy(asc(pois.orderIndex), asc(pois.createdAt));

    const geoJsonData = generateGeoJson(
      {
        id: trip.id,
        title: trip.title,
      },
      tripPois.map((p) => ({
        id: p.id,
        title: p.title,
        category: p.category,
        status: p.status,
        isMustSee: Boolean(p.isMustSee),
        lat: Number(p.lat),
        lng: Number(p.lng),
        address: p.address,
        dayStart: p.dayStart,
        dayEnd: p.dayEnd,
        orderIndex: p.orderIndex,
        estimatedCost: Number(p.estimatedCost ?? 0),
        notes: p.notes,
      }))
    );

    return new Response(JSON.stringify(geoJsonData, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/geo+json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(trip.title)}.geojson"`,
      },
    });
  } catch (error) {
    console.error('Error exporting trip GeoJSON:', error);
    return NextResponse.json({ error: 'Failed to export GeoJSON' }, { status: 500 });
  }
}
