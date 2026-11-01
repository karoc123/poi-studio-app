import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db, users } from '@/lib/db';
import {
  getSessionUser,
  signSession,
  AUTH_COOKIE_OPTIONS,
} from '@/lib/auth';

const HEX_COLOR_REGEX = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;

export async function PATCH(req: Request) {
  try {
    const sessionUser = await getSessionUser(req);
    if (!sessionUser) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      );
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, sessionUser.id))
      .limit(1);

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const updates: Partial<typeof users.$inferInsert> = {};
    let shouldUpdateCookie = false;
    let newAvatarColor = user.avatarColor;

    // 1. Handle avatarColor update
    if ('avatarColor' in body) {
      const color = body.avatarColor;
      if (typeof color !== 'string' || !HEX_COLOR_REGEX.test(color)) {
        return NextResponse.json(
          { error: 'avatarColor must be a valid hex color code (e.g. #6366F1)' },
          { status: 400 }
        );
      }
      updates.avatarColor = color;
      newAvatarColor = color;
      shouldUpdateCookie = true;
    }

    // 2. Handle password update / removal
    if ('newPassword' in body) {
      const { currentPassword, newPassword } = body;

      // If user currently has a password, verify current password first
      if (user.passwordHash) {
        if (!currentPassword || typeof currentPassword !== 'string') {
          return NextResponse.json(
            { error: 'Current password is required to change or remove password' },
            { status: 400 }
          );
        }

        const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
        if (!isMatch) {
          return NextResponse.json(
            { error: 'Current password is incorrect' },
            { status: 400 }
          );
        }
      }

      // Check new password action
      if (newPassword === null || newPassword === '') {
        // Revert to passwordless mode
        updates.passwordHash = null;
      } else if (typeof newPassword === 'string') {
        if (newPassword.length < 4) {
          return NextResponse.json(
            { error: 'New password must be at least 4 characters long' },
            { status: 400 }
          );
        }
        updates.passwordHash = await bcrypt.hash(newPassword, 10);
      } else {
        return NextResponse.json(
          { error: 'Invalid new password value' },
          { status: 400 }
        );
      }
    }

    // Apply updates if any
    const now = Date.now();
    updates.updatedAt = now;

    await db.update(users).set(updates).where(eq(users.id, user.id));

    const finalHasPassword =
      updates.passwordHash !== undefined
        ? Boolean(updates.passwordHash)
        : Boolean(user.passwordHash);

    const updatedUser = {
      id: user.id,
      username: user.username,
      avatarColor: newAvatarColor,
      hasPassword: finalHasPassword,
    };

    const response = NextResponse.json({
      success: true,
      user: updatedUser,
    });

    if (shouldUpdateCookie) {
      const token = await signSession({
        id: user.id,
        username: user.username,
        avatarColor: newAvatarColor,
      });
      response.cookies.set({
        ...AUTH_COOKIE_OPTIONS,
        value: token,
      });
    }

    return response;
  } catch (error) {
    console.error('Error updating profile:', error);
    return NextResponse.json(
      { error: 'Failed to update profile' },
      { status: 500 }
    );
  }
}
