import type { NextConfig } from 'next';
import { createRequire } from 'node:module';
import { relative, resolve } from 'node:path';

const projectRequire = createRequire(resolve(process.cwd(), 'package.json'));
// Trace the real package path so the asset is not nested beneath a pnpm symlink.
const pdfiumWasmPath = relative(
  process.cwd(),
  projectRequire.resolve('@hyzyla/pdfium/pdfium.wasm'),
).replaceAll('\\', '/');

const config: NextConfig = {
  serverExternalPackages: ['@libsql/client', '@hyzyla/pdfium'],
  outputFileTracingIncludes: { '/api/**/*': [pdfiumWasmPath] },
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: [
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'Referrer-Policy', value: 'no-referrer' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Content-Security-Policy', value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" },
    ] }];
  },
};
export default config;
