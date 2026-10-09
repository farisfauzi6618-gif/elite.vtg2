const PRIMARY = 'https://elitevtg.vercel.app';
const PREVIOUS = 'https://elite-vtg2.vercel.app';

export function canonicalDestination(request: Request, configuredOrigin: string | undefined): URL | null {
  const current = new URL(request.url);
  if (configuredOrigin?.trim() !== PRIMARY || current.origin !== PREVIOUS || !['GET', 'HEAD'].includes(request.method)) return null;
  // Open forms, callbacks and asset requests keep working on the original host.
  if (/^\/(?:api|_next)(?:\/|$)/.test(current.pathname) || /\.[^/]+$/.test(current.pathname)) return null;
  const next = new URL(PRIMARY);
  next.pathname = current.pathname;
  next.search = current.search;
  if (/^\/order\/?$/.test(current.pathname) && current.searchParams.get('manual') !== 'baru') {
    const token = request.headers.get('cookie')?.split(';').map(part => part.trim()).find(part => part.startsWith('elite_order='))?.slice(12);
    if (token && /^[a-f0-9]{64}$/.test(token)) { next.pathname = '/order/lanjutkan'; next.hash = token; }
  }
  return next;
}
