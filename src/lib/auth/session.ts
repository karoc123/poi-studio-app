import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import type { SessionUser, JWTPayloadData } from '@/types';

import { AUTH_COOKIE_NAME, SESSION_MAX_AGE_SECONDS } from './constants';
export { AUTH_COOKIE_NAME, SESSION_MAX_AGE_SECONDS };

const JWT_SECRET_STRING =
  process.env.AUTH_SECRET || 'poi-studio-production-secure-jwt-secret-key-at-least-32-chars-long-2026';

const secretKey = new TextEncoder().encode(JWT_SECRET_STRING);

export const AUTH_COOKIE_OPTIONS = {
  name: AUTH_COOKIE_NAME,
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: SESSION_MAX_AGE_SECONDS,
  secure: process.env.NODE_ENV === 'production',
};

/**
 * Sign a 30-day JWT session token using jose
 */
export async function signSession(user: {
  id: string;
  username: string;
  avatarColor: string;
}): Promise<string> {
  return await new SignJWT({
    username: user.username,
    avatarColor: user.avatarColor,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(secretKey);
}

/**
 * Interface contract alias: createSessionToken
 */
export async function createSessionToken(user: {
  id: string;
  username: string;
  avatarColor: string;
}): Promise<string> {
  return signSession(user);
}

/**
 * Verify and decode a JWT session token using jose
 */
export async function verifySessionToken(token: string): Promise<SessionUser | null> {
  if (!token || typeof token !== 'string') {
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, secretKey);
    const sub = payload.sub;
    const username = payload.username as string | undefined;
    const avatarColor = (payload.avatarColor as string | undefined) || '#6366F1';

    if (!sub || !username) {
      return null;
    }

    return {
      id: sub,
      username,
      avatarColor,
    };
  } catch {
    return null;
  }
}

/**
 * Helper to parse cookies from raw cookie header
 */
export function parseCookies(cookieHeader: string | null | undefined): Record<string, string> {
  if (!cookieHeader) return {};
  const map: Record<string, string> = {};
  const pairs = cookieHeader.split(';');
  for (const pair of pairs) {
    const eqIdx = pair.indexOf('=');
    if (eqIdx === -1) continue;
    const key = pair.slice(0, eqIdx).trim();
    const val = pair.slice(eqIdx + 1).trim();
    if (key) {
      try {
        map[key] = decodeURIComponent(val);
      } catch {
        map[key] = val;
      }
    }
  }
  return map;
}

/**
 * Extract auth_token from Request header or URL
 */
export function extractTokenFromRequest(req: Request): string | null {
  // 1. Check Authorization Bearer header
  const authHeader = req.headers.get('authorization') || req.headers.get('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }

  // 2. Check Cookie header
  const cookieHeader = req.headers.get('cookie') || req.headers.get('Cookie');
  if (cookieHeader) {
    const parsed = parseCookies(cookieHeader);
    if (parsed[AUTH_COOKIE_NAME]) {
      return parsed[AUTH_COOKIE_NAME];
    }
  }

  return null;
}

/**
 * Retrieve authenticated user from Request or cookies()
 * Complies with M1 <-> M2 Interface Contract:
 * getSessionUser(req?: Request): Promise<{ id: string; username: string; avatarColor: string } | null>
 */
export async function getSessionUser(
  req?: Request
): Promise<SessionUser | null> {
  let token: string | null = null;

  if (req) {
    token = extractTokenFromRequest(req);
  } else {
    try {
      const cookieStore = await cookies();
      const cookieObj = cookieStore.get(AUTH_COOKIE_NAME);
      if (cookieObj?.value) {
        token = cookieObj.value;
      }
    } catch {
      // In non-request context or when cookies() is unavailable
      token = null;
    }
  }

  if (!token) {
    return null;
  }

  return await verifySessionToken(token);
}
