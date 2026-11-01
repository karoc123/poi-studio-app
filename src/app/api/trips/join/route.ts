import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { joinTripByInviteCode, PermissionError } from '@/lib/permissions';

export async function POST(req: Request) {
  try {
    const sessionUser = await getSessionUser(req);
    if (!sessionUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await req.json().catch(() => null);
    const inviteCode = body?.inviteCode;

    if (!inviteCode || typeof inviteCode !== 'string' || !inviteCode.trim()) {
      return NextResponse.json(
        { error: 'Invite code is required' },
        { status: 400 }
      );
    }

    const result = await joinTripByInviteCode(inviteCode, sessionUser.id);

    return NextResponse.json({
      success: true,
      tripId: result.trip.id,
      role: result.membership.role,
      trip: result.trip,
      isNewMember: result.isNewMember,
    });
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      );
    }

    console.error('Error joining trip by invite code:', error);
    return NextResponse.json(
      { error: 'Internal server error while joining trip' },
      { status: 500 }
    );
  }
}
