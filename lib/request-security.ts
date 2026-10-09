/** Browser mutations require the current origin, including Vercel previews. */
export function sameOrigin(request: Request) {
  return request.headers.get('origin') === new URL(request.url).origin && request.headers.get('sec-fetch-site') !== 'cross-site';
}

export function clientIp(request: Request) {
  // Vercel overwrites this header at its trusted ingress. No Cloudflare header trust.
  if (process.env.VERCEL) return request.headers.get('x-vercel-forwarded-for')?.split(',')[0].trim() || 'unknown';
  return 'local';
}
