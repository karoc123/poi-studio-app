import { NextResponse } from 'next/server';
import { eq, and, asc } from 'drizzle-orm';
import { db, trips, tripMembers, pois } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';
import { generateIcs } from '@/lib/export';

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

    // Fetch POIs (all POIs or scheduled stops)
    const tripPois = await db
      .select()
      .from(pois)
      .where(eq(pois.tripId, tripId))
      .orderBy(asc(pois.dayStart), asc(pois.orderIndex), asc(pois.createdAt));

    const icsContent = generateIcs(
      {
        id: trip.id,
        title: trip.title,
        description: trip.description,
        startDate: trip.startDate,
        endDate: trip.endDate,
      },
      tripPois.map((p) => ({
        id: p.id,
        title: p.title,
        notes: p.notes,
        address: p.address,
        lat: Number(p.lat),
        lng: Number(p.lng),
        dayStart: p.dayStart,
        timeSlot: p.timeSlot,
        durationMinutes: p.durationMinutes,
      }))
    );

    return new Response(icsContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(trip.title)}.ics"`,
      },
    });
  } catch (error) {
    console.error('Error exporting trip iCal:', error);
    return NextResponse.json({ error: 'Failed to export iCal' }, { status: 500 });
  }
}
