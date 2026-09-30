import { NextResponse, NextRequest } from 'next/server';
import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';
import { verifyTokenFromRequest } from '@/lib/security/session';
import { isOriginAllowed } from '@/lib/security/csrf';
import { authRepository } from '@/lib/db/repositories/auth.repo';

const intlMiddleware = createMiddleware(routing);

const PROTECTED_PREFIXES = ['/dashboard', '/api/dashboard', '/api/patients', '/api/plans', '/api/exercise-plans', '/api/visits', '/api/foods', '/api/food-lists', '/api/food-requests', '/api/ai', '/api/admin', '/api/templates', '/api/settings', '/api/print-links', '/api/messages', '/api/files', '/api/labs', '/api/errors'];
const PUBLIC_API_PREFIXES = ['/api/setup', '/api/seed', '/api/health', '/api/auth', '/api/patient-portal', '/api/contact', '/api/newsletter/confirm', '/api/newsletter/unsubscribe'];
const ADMIN_PREFIXES = ['/admin', '/api/admin'];

export default async function middleware(request: NextRequest) {
  // OBS-03: request-id generated here, propagated to responses and logs.
  const requestId = request.headers.get('x-request-id') || crypto.randomUUID();

  // SEC-05: per-request nonce CSP (no unsafe-inline/unsafe-eval in prod).
  const nonce = crypto.randomUUID().replace(/-/g, '');
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "connect-src 'self'",
    "font-src 'self' data:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');

  const { pathname } = new URL(request.url);
  const isApi = pathname.startsWith('/api/');
  // next-intl middleware only handles locale pages; API routes bypass it
  // (it would otherwise 404/redirect non-locale paths).
  const response = isApi ? NextResponse.next() : intlMiddleware(request);
  response.headers.set('x-request-id', requestId);
  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('x-nonce', nonce);

  const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));
  const isPublicApi = PUBLIC_API_PREFIXES.some((p) => pathname.startsWith(p));
  const isAdminRoute = ADMIN_PREFIXES.some((p) => pathname.startsWith(p));

  if (!isProtected || isPublicApi) {
    return response;
  }

  const verification = await verifyTokenFromRequest(request);
  if (!verification) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } }, { status: 401 });
    }
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  const isRevoked = await authRepository.isTokenRevoked(verification.jti);
  if (isRevoked) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Session revoked' } }, { status: 401 });
    }
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-user-id', verification.sub);
  requestHeaders.set('x-user-role', verification.role);
  requestHeaders.set('x-user-email', verification.email);
  requestHeaders.set('x-session-jti', verification.jti);
  requestHeaders.set('x-request-id', requestId);
  requestHeaders.set('x-nonce', nonce);

  if (isAdminRoute) {
    const allowedRoles = ['admin', 'super_admin'] as const;
    if (!allowedRoles.includes(verification.role as 'admin' | 'super_admin')) {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ success: false, error: { code: 'FORBIDDEN', message: 'Admin access required' } }, { status: 403 });
      }
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
  }

  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
    if (!isOriginAllowed(request.headers.get('origin'), request.headers.get('host'))) {
      return NextResponse.json({ success: false, error: { code: 'CSRF_ERROR', message: 'Invalid origin' } }, { status: 403 });
    }
  }

  const finalResponse = NextResponse.next({
    request: { headers: requestHeaders },
  });
  finalResponse.headers.set('x-request-id', requestId);
  finalResponse.headers.set('Content-Security-Policy', csp);
  finalResponse.headers.set('x-nonce', nonce);
  return finalResponse;
}

export const config = {
  // /api/* included so JWT/CSRF/admin guards and the nonce CSP apply to
  // API routes too (locale pages keep next-intl handling; /api bypasses it).
  matcher: ['/', '/(ar|en)/:path*', '/api/:path*'],
};