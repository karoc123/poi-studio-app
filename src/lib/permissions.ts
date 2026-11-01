import { eq, and } from 'drizzle-orm';
import { db, trips, tripMembers, users } from '@/lib/db';
import type { Role, MemberWithUser } from '@/types';

export type { Role, MemberWithUser };

export class PermissionError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 403) {
    super(message);
    this.name = 'PermissionError';
    this.statusCode = statusCode;
  }
}

/**
 * Granular Permission Matrix
 * - OWNER: Trip metadata, deletion, invite code regeneration, role changes, member removal.
 * - EDITOR: Add/edit/delete POIs, upvote, comment, checklists, scratchpad.
 * - VIEWER: Read-only access (map, inspecting POIs, checklists, exports). All mutations 403.
 */
export const PERMISSIONS = {
  OWNER: {
    canEditMetadata: true,
    canDeleteTrip: true,
    canRegenerateInviteCode: true,
    canManageMembers: true,
    canEditScratchpad: true,
    canManagePois: true,
    canVote: true,
    canComment: true,
    canManageChecklists: true,
    isReadOnly: false,
  },
  EDITOR: {
    canEditMetadata: false,
    canDeleteTrip: false,
    canRegenerateInviteCode: false,
    canManageMembers: false,
    canEditScratchpad: true,
    canManagePois: true,
    canVote: true,
    canComment: true,
    canManageChecklists: true,
    isReadOnly: false,
  },
  VIEWER: {
    canEditMetadata: false,
    canDeleteTrip: false,
    canRegenerateInviteCode: false,
    canManageMembers: false,
    canEditScratchpad: false,
    canManagePois: false,
    canVote: false,
    canComment: false,
    canManageChecklists: false,
    isReadOnly: true,
  },
} as const;

export function canEditTripMetadata(role: Role): boolean {
  return PERMISSIONS[role]?.canEditMetadata ?? false;
}

export function canDeleteTrip(role: Role): boolean {
  return PERMISSIONS[role]?.canDeleteTrip ?? false;
}

export function canRegenerateInviteCode(role: Role): boolean {
  return PERMISSIONS[role]?.canRegenerateInviteCode ?? false;
}

export function canManageMembers(role: Role): boolean {
  return PERMISSIONS[role]?.canManageMembers ?? false;
}

export function canEditScratchpad(role: Role): boolean {
  return PERMISSIONS[role]?.canEditScratchpad ?? false;
}

export function canManagePois(role: Role): boolean {
  return PERMISSIONS[role]?.canManagePois ?? false;
}

export function canVote(role: Role): boolean {
  return PERMISSIONS[role]?.canVote ?? false;
}

export function canComment(role: Role): boolean {
  return PERMISSIONS[role]?.canComment ?? false;
}

export function canManageChecklists(role: Role): boolean {
  return PERMISSIONS[role]?.canManageChecklists ?? false;
}

export function isReadOnly(role: Role): boolean {
  return PERMISSIONS[role]?.isReadOnly ?? true;
}

/**
 * Retrieve membership record for a specific trip and user, joined with user details.
 * Interface Contract M2 <-> M3
 */
export async function getTripMembership(
  tripId: string,
  userId: string
): Promise<MemberWithUser | null> {
  if (!tripId || !userId) {
    return null;
  }

  const [membership] = await db
    .select({
      id: tripMembers.id,
      tripId: tripMembers.tripId,
      userId: tripMembers.userId,
      role: tripMembers.role,
      joinedAt: tripMembers.joinedAt,
      user: {
        id: users.id,
        username: users.username,
        avatarColor: users.avatarColor,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      },
    })
    .from(tripMembers)
    .innerJoin(users, eq(tripMembers.userId, users.id))
    .where(and(eq(tripMembers.tripId, tripId), eq(tripMembers.userId, userId)))
    .limit(1);

  if (!membership) {
    return null;
  }

  return {
    id: membership.id,
    tripId: membership.tripId,
    userId: membership.userId,
    role: membership.role as Role,
    joinedAt: membership.joinedAt,
    user: membership.user,
  };
}

/**
 * Require a specific role or set of roles for a trip operation.
 * Throws PermissionError (403 or 404) or returns the membership.
 * Interface Contract M2 <-> M3
 */
export async function requireRole(
  tripId: string,
  userId: string,
  allowedRoles: Role[]
): Promise<MemberWithUser> {
  const membership = await getTripMembership(tripId, userId);

  if (!membership) {
    throw new PermissionError('You are not a member of this trip', 403);
  }

  if (!allowedRoles.includes(membership.role as Role)) {
    throw new PermissionError(
      `Forbidden: role '${membership.role}' does not have sufficient permissions`,
      403
    );
  }

  return membership;
}

/**
 * Enroll a user into a trip via invite code as an EDITOR.
 * If user is already a member, enrollment is idempotent and returns existing membership.
 * Interface Contract M2 <-> M3
 */
export async function joinTripByInviteCode(
  inviteCode: string,
  userId: string
): Promise<{
  trip: typeof trips.$inferSelect;
  membership: MemberWithUser;
  isNewMember: boolean;
}> {
  if (!inviteCode || typeof inviteCode !== 'string' || !inviteCode.trim()) {
    throw new PermissionError('Invite code is required', 400);
  }

  const cleanCode = inviteCode.trim();

  const [trip] = await db
    .select()
    .from(trips)
    .where(eq(trips.inviteCode, cleanCode))
    .limit(1);

  if (!trip) {
    throw new PermissionError('Trip not found with the provided invite code', 404);
  }

  // Check if user is already enrolled
  const existingMembership = await getTripMembership(trip.id, userId);
  if (existingMembership) {
    return {
      trip,
      membership: existingMembership,
      isNewMember: false,
    };
  }

  // Enroll user as EDITOR
  const newMemberId = crypto.randomUUID();
  const joinedAt = Date.now();

  await db.insert(tripMembers).values({
    id: newMemberId,
    tripId: trip.id,
    userId,
    role: 'EDITOR',
    joinedAt,
  });

  const createdMembership = await getTripMembership(trip.id, userId);
  if (!createdMembership) {
    throw new PermissionError('Failed to create trip membership', 500);
  }

  return {
    trip,
    membership: createdMembership,
    isNewMember: true,
  };
}
