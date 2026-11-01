import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, trips } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';
import { requireRole, PermissionError } from '@/lib/permissions';
import { generateInviteCode } from '@/lib/trip-utils';

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

    // Check if trip exists
    const [trip] = await db
      .select()
      .from(trips)
      .where(eq(trips.id, tripId))
      .limit(1);

    if (!trip) {
      return NextResponse.json({ error: 'Trip not found' }, { status: 404 });
    }

    // Require OWNER role
    await requireRole(tripId, sessionUser.id, ['OWNER']);

    // Generate new unique 10-character invite code
    let newCode = generateInviteCode(10);
    // Ensure it differs from current code
    while (newCode === trip.inviteCode) {
      newCode = generateInviteCode(10);
    }

    const now = Date.now();
    await db
      .update(trips)
      .set({
        inviteCode: newCode,
        updatedAt: now,
      })
      .where(eq(trips.id, tripId));

    return NextResponse.json({
      success: true,
      inviteCode: newCode,
    });
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      );
    }

    console.error('Error regenerating invite code:', error);
    return NextResponse.json(
      { error: 'Failed to regenerate invite code' },
      { status: 500 }
    );
  }
}
