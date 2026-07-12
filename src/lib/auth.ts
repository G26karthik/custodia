import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { Role } from '@prisma/client';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'super-secret-jwt-key-for-assetflow-hackathon-2026'
);

export interface SessionPayload {
  userId: string;
  email: string;
  role: Role;
}

// Global variable for mocking cookies in standalone test environments
let mockCookieStore: {
  get: (key: string) => { value: string } | undefined;
  set: (key: string, value: string, options?: any) => void;
  delete: (key: string) => void;
} | null = null;

export function setMockCookieStore(store: typeof mockCookieStore) {
  mockCookieStore = store;
}

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(JWT_SECRET);
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET, {
      algorithms: ['HS256'],
    });
    return payload as unknown as SessionPayload;
  } catch (error) {
    return null;
  }
}

export async function setSessionCookie(token: string) {
  if (mockCookieStore) {
    mockCookieStore.set('session', token);
    return;
  }
  const cookieStore = await cookies();
  cookieStore.set('session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24, // 24 hours
  });
}

export async function clearSessionCookie() {
  if (mockCookieStore) {
    mockCookieStore.delete('session');
    return;
  }
  const cookieStore = await cookies();
  cookieStore.delete('session');
}

export async function getSession(): Promise<SessionPayload | null> {
  let token: string | undefined;
  if (mockCookieStore) {
    token = mockCookieStore.get('session')?.value;
  } else {
    const cookieStore = await cookies();
    token = cookieStore.get('session')?.value;
  }
  if (!token) return null;
  return verifySession(token);
}
