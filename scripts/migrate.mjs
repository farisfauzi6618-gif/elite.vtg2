import { createClient } from '@libsql/client';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { migrate } from './migration-core.mjs';

const url = process.env.TURSO_DATABASE_URL || (!process.env.VERCEL ? 'file:.data/elite.db' : '');
if (!url) throw new Error('Set TURSO_DATABASE_URL.');
if (process.env.VERCEL && url.startsWith('file:')) throw new Error('Vercel requires a remote database.');
if (url.startsWith('file:') && url !== 'file::memory:') await mkdir(path.dirname(url.slice(5)), { recursive: true });
const client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN, intMode: 'number' });
try {
  const check = process.argv.includes('--check');
  const result = await migrate(client, new URL('../migrations/', import.meta.url), { check });
  console.log(`${check ? 'Pending' : 'Applied'} migrations: ${result.pending.length} / ${result.total}`);
  if (check && result.pending.length) process.exitCode = 1;
} finally { client.close(); }
