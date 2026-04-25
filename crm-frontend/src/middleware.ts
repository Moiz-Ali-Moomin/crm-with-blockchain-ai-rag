import { NextRequest, NextResponse } from 'next/server';

/**
 * Route protection middleware — runs on the Next.js Edge before a page is served.
 *
 * Strategy: check for the access_token cookie set by NestJS on login.
 * The cookie is httpOnly so JS can't read it, but the Edge runtime can inspect
 * the raw Cookie header. If it's missing the user is not logged in → redirect
 * to /login with the original path preserved as ?redirect=.
 *
 * Full JWT validation (signature + blacklist) happens on every NestJS API call,
 * so the middleware only needs to confirm the cookie is present to gate the UI.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasToken = request.cookies.has('access_token');

  if (!hasToken) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  // Only run on dashboard routes — leave auth pages and API routes untouched.
  matcher: ['/dashboard/:path*'],
};
