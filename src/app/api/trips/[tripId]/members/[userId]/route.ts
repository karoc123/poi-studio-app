import { NextResponse } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { db, tripMembers, users, trips } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';
import { requireRole, getTripMembership, PermissionError } from '@/lib/permissions';
import type { Role } from '@/types';

async function handleUpdateRole(
  req: Request,
  { params }: { params: Promise<{ tripId: string; userId: string }> }
) {
  try {
    const sessionUser = await getSessionUser(req);
    if (!sessionUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { tripId, userId: targetUserId } = await params;

    // Verify trip exists
    const [trip] = await db
      .select()
      .from(trips)
      .where(eq(trips.id, tripId))
      .limit(1);

    if (!trip) {
      return NextResponse.json({ error: 'Trip not found' }, { status: 404 });
    }

    // Only OWNER can modify member roles
    await requireRole(tripId, sessionUser.id, ['OWNER']);

    // Check target member exists
    const targetMember = await getTripMembership(tripId, targetUserId);
    if (!targetMember) {
      return NextResponse.json({ error: 'Member not found' }, { status: 404 });
    }

    const body = await req.json().catch(() => null);
    const newRole = body?.role as Role | undefined;

    const allowedRoles: Role[] = ['OWNER', 'EDITOR', 'VIEWER'];
    if (!newRole || !allowedRoles.includes(newRole)) {
      return NextResponse.json(
        { error: 'Invalid role. Must be OWNER, EDITOR, or VIEWER' },
        { status: 400 }
      );
    }

    // Edge Case 17: Sole owner cannot demote themselves or be demoted without another owner
    if (targetMember.role === 'OWNER' && newRole !== 'OWNER') {
      const ownerCount = await db
        .select({ id: tripMembers.id })
        .from(tripMembers)
        .where(
          and(eq(tripMembers.tripId, tripId), eq(tripMembers.role, 'OWNER'))
        );

      if (ownerCount.length <= 1) {
        return NextResponse.json(
          {
            error:
              'Cannot demote the sole owner of a trip. Transfer ownership or assign another owner first.',
          },
          { status: 400 }
        );
      }
    }

    // Update member role
    await db
      .update(tripMembers)
      .set({ role: newRole })
      .where(
        and(
          eq(tripMembers.tripId, tripId),
          eq(tripMembers.userId, targetUserId)
        )
      );

    const updatedMember = await getTripMembership(tripId, targetUserId);

    return NextResponse.json({
      success: true,
      member: updatedMember,
    });
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      );
    }

    console.error('Error updating member role:', error);
    return NextResponse.json(
      { error: 'Failed to update member role' },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: Request,
  context: { params: Promise<{ tripId: string; userId: string }> }
) {
  return handleUpdateRole(req, context);
}

export async function PATCH(
  req: Request,
  context: { params: Promise<{ tripId: string; userId: string }> }
) {
  return handleUpdateRole(req, context);
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ tripId: string; userId: string }> }
) {
  try {
    const sessionUser = await getSessionUser(req);
    if (!sessionUser) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { tripId, userId: targetUserId } = await params;

    // Verify trip exists
    const [trip] = await db
      .select()
      .from(trips)
      .where(eq(trips.id, tripId))
      .limit(1);

    if (!trip) {
      return NextResponse.json({ error: 'Trip not found' }, { status: 404 });
    }

    // Check target member exists
    const targetMember = await getTripMembership(tripId, targetUserId);
    if (!targetMember) {
      return NextResponse.json(
        { error: 'Member not found in trip' },
        { status: 404 }
      );
    }

    const isSelfRemoval = sessionUser.id === targetUserId;

    if (isSelfRemoval) {
      // Voluntary departure: Edge Case 17: Sole owner cannot leave trip without transferring ownership
      if (targetMember.role === 'OWNER') {
        const ownerCount = await db
          .select({ id: tripMembers.id })
          .from(tripMembers)
          .where(
            and(eq(tripMembers.tripId, tripId), eq(tripMembers.role, 'OWNER'))
          );

        if (ownerCount.length <= 1) {
          return NextResponse.json(
            {
              error:
                'Sole owner cannot leave trip without transferring ownership',
            },
            { status: 400 }
          );
        }
      }
    } else {
      // Removing another member: Must be OWNER
      await requireRole(tripId, sessionUser.id, ['OWNER']);
    }

    // Delete the member record
    await db
      .delete(tripMembers)
      .where(
        and(
          eq(tripMembers.tripId, tripId),
          eq(tripMembers.userId, targetUserId)
        )
      );

    return NextResponse.json({
      success: true,
      message: 'Member removed successfully',
    });
  } catch (error) {
    if (error instanceof PermissionError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode }
      );
    }

    console.error('Error removing member:', error);
    return NextResponse.json(
      { error: 'Failed to remove member' },
      { status: 500 }
    );
  }
}
