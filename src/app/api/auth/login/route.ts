import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db, users } from '@/lib/db';
import {
  signSession,
  AUTH_COOKIE_OPTIONS,
  getRandomAvatarColor,
} from '@/lib/auth';

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      );
    }

    const rawUsername = body.username;
    const rawPassword = body.password;

    if (!rawUsername || typeof rawUsername !== 'string') {
      return NextResponse.json(
        { error: 'Username is required' },
        { status: 400 }
      );
    }

    const username = rawUsername.trim();
    if (username.length < 1 || username.length > 50) {
      return NextResponse.json(
        { error: 'Username must be between 1 and 50 characters' },
        { status: 400 }
      );
    }

    // Check if user exists
    const [existingUser] = await db
      .select()
      .from(users)
      .where(eq(users.username, username))
      .limit(1);

    const now = Date.now();

    // Case 1: User does not exist -> Auto-registration
    if (!existingUser) {
      const id = crypto.randomUUID();
      const avatarColor = getRandomAvatarColor();
      let passwordHash: string | null = null;

      if (rawPassword && typeof rawPassword === 'string' && rawPassword.length > 0) {
        passwordHash = await bcrypt.hash(rawPassword, 10);
      }

      await db.insert(users).values({
        id,
        username,
        passwordHash,
        avatarColor,
        createdAt: now,
        updatedAt: now,
      });

      const sessionUser = { id, username, avatarColor };
      const token = await signSession(sessionUser);

      const response = NextResponse.json(
        {
          success: true,
          user: {
            ...sessionUser,
            hasPassword: !!passwordHash,
          },
          isNewUser: true,
        },
        { status: 201 }
      );

      response.cookies.set({
        ...AUTH_COOKIE_OPTIONS,
        value: token,
      });

      return response;
    }

    // Case 2: User exists but has no password (Passwordless mode)
    if (!existingUser.passwordHash) {
      const sessionUser = {
        id: existingUser.id,
        username: existingUser.username,
        avatarColor: existingUser.avatarColor,
      };
      const token = await signSession(sessionUser);

      const response = NextResponse.json({
        success: true,
        user: {
          ...sessionUser,
          hasPassword: false,
        },
        isNewUser: false,
      });

      response.cookies.set({
        ...AUTH_COOKIE_OPTIONS,
        value: token,
      });

      return response;
    }

    // Case 3: User exists and has a password
    if (!rawPassword || typeof rawPassword !== 'string' || rawPassword.length === 0) {
      return NextResponse.json(
        {
          error: 'Password is required for this account',
          code: 'PASSWORD_REQUIRED',
        },
        { status: 401 }
      );
    }

    const isMatch = await bcrypt.compare(rawPassword, existingUser.passwordHash);
    if (!isMatch) {
      return NextResponse.json(
        {
          error: 'Invalid password. Please check your credentials.',
          code: 'INVALID_CREDENTIALS',
        },
        { status: 401 }
      );
    }

    const sessionUser = {
      id: existingUser.id,
      username: existingUser.username,
      avatarColor: existingUser.avatarColor,
    };
    const token = await signSession(sessionUser);

    const response = NextResponse.json({
      success: true,
      user: {
        ...sessionUser,
        hasPassword: true,
      },
      isNewUser: false,
    });

    response.cookies.set({
      ...AUTH_COOKIE_OPTIONS,
      value: token,
    });

    return response;
  } catch (error) {
    console.error('Error during login:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred during login' },
      { status: 500 }
    );
  }
}
