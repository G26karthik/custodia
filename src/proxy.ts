import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'super-secret-jwt-key-for-assetflow-hackathon-2026'
);

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Define paths that do not require authentication
  const isAuthPage = pathname.startsWith('/login') || pathname.startsWith('/signup');
  const isApiAuth = pathname.startsWith('/api/auth');
  const isStatic = pathname.startsWith('/_next') || pathname.includes('.');

  if (isStatic || isApiAuth) {
    return NextResponse.next();
  }

  // Get session cookie
  const sessionToken = request.cookies.get('session')?.value;

  let session = null;
  if (sessionToken) {
    try {
      const { payload } = await jwtVerify(sessionToken, JWT_SECRET, {
        algorithms: ['HS256'],
      });
      session = payload;
    } catch (error) {
      // Invalid token, clear cookie
      const response = NextResponse.redirect(new URL('/login', request.url));
      response.cookies.delete('session');
      return response;
    }
  }

  // Redirect unauthenticated users
  if (!session) {
    if (!isAuthPage) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
    return NextResponse.next();
  }

  // Redirect authenticated users away from auth pages
  if (isAuthPage) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  // Protect admin routes
  if (pathname.startsWith('/admin') && session.role !== 'ADMIN') {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  // Protect API admin routes
  if (pathname.startsWith('/api/admin') && session.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (except api/admin or api/auth)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
