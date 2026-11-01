import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, users } from '@/lib/db';
import { getSessionUser } from '@/lib/auth';

export async function GET(req: Request) {
  try {
    const sessionUser = await getSessionUser(req);
    if (!sessionUser) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    const [user] = await db
      .select({
        id: users.id,
        username: users.username,
        avatarColor: users.avatarColor,
        passwordHash: users.passwordHash,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, sessionUser.id))
      .limit(1);

    if (!user) {
      return NextResponse.json(
        { error: 'User account not found' },
        { status: 401 }
      );
    }

    return NextResponse.json({
      user: {
        id: user.id,
        username: user.username,
        avatarColor: user.avatarColor,
        hasPassword: Boolean(user.passwordHash),
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    console.error('Error fetching current user:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve user profile' },
      { status: 500 }
    );
  }
}
