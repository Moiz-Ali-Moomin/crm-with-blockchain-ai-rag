import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // Check for your auth cookies (adjust the name if your app uses 'accessToken' strictly)
  const hasToken = request.cookies.has('refreshToken') || request.cookies.has('accessToken');
  const { pathname } = request.nextUrl;

  const isAuthPage = pathname.startsWith('/login') || 
                     pathname.startsWith('/register') || 
                     pathname.startsWith('/forgot-password') || 
                     pathname.startsWith('/reset-password');
                     
  const isDashboardPage = pathname.startsWith('/dashboard');

  // 1. Unauthenticated users trying to access the dashboard get redirected to login
  if (!hasToken && isDashboardPage) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // 2. Authenticated users trying to access auth pages get redirected to dashboard
  if (hasToken && isAuthPage) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  // 3. Allow all other requests (like the homepage '/') to proceed normally
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api, _next/static, _next/image, favicon.ico, sitemap.xml, robots.txt
     * - / (the root landing page - represented by the $ at the end)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|$).*)',
  ],
};