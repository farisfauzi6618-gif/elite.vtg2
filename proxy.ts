import { NextResponse, type NextRequest } from 'next/server';
import { canonicalDestination } from './lib/canonical-domain';

export function proxy(request: NextRequest) {
  const destination = canonicalDestination(request, process.env.SITE_ORIGIN);
  if (!destination) return NextResponse.next();
  const response = NextResponse.redirect(destination, 302);
  response.headers.set('Cache-Control', 'private, no-store');
  response.headers.set('Referrer-Policy', 'no-referrer');
  return response;
}

export const config = { matcher: '/((?!api|_next|.*\\.[^/]+$).*)' };
