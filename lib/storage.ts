import { put, get, del } from '@vercel/blob';
import { mkdir, readFile, writeFile, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';

function safeKey(key: string) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9/_-]{0,230}(?:\.[a-zA-Z0-9]{1,10})?$/.test(key) || key.includes('..')) throw new Error('Invalid storage key');
  return key;
}
function localRoot() {
  if (process.env.VERCEL || process.env.NODE_ENV === 'production' && process.env.STORAGE_DRIVER !== 'local') throw new Error('Create a private Blob store and set BLOB_READ_WRITE_TOKEN.');
  return path.resolve(process.env.LOCAL_STORAGE_PATH || '.data/files');
}
const local = () => !process.env.BLOB_READ_WRITE_TOKEN && !process.env.BLOB_STORE_ID;

export const storage = {
  async head(key: string) {
    safeKey(key);
    if (local()) {
      const dest = path.join(localRoot(), key);
      try {
        const info = await stat(dest);
        const meta = JSON.parse(await readFile(dest + '.meta.json', 'utf8')) as { contentType: string };
        return { size: info.size, httpMetadata: { contentType: meta.contentType } };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw error;
      }
    }
    const result = await get('elite/' + key, { access: 'private', useCache: false, token: process.env.BLOB_READ_WRITE_TOKEN });
    if (!result?.stream) return null;
    await result.stream.cancel();
    return { size: result.blob.size, httpMetadata: { contentType: result.blob.contentType || 'application/octet-stream' } };
  },
  async put(key: string, input: Uint8Array | ArrayBuffer, options?: { httpMetadata?: { contentType?: string } }) {
    safeKey(key);
    const bytes = new Uint8Array(input), contentType = options?.httpMetadata?.contentType || 'application/octet-stream';
    if (local()) {
      const dest = path.join(localRoot(), key);
      await mkdir(path.dirname(dest), { recursive: true });
      const pending = dest + '.' + crypto.randomUUID() + '.tmp';
      await writeFile(pending, bytes);
      await rename(pending, dest);
      await writeFile(dest + '.meta.json', JSON.stringify({ contentType }));
      return;
    }
    await put('elite/' + key, Buffer.from(bytes), {
      access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType,
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
  },
  async get(key: string) {
    safeKey(key);
    if (local()) {
      const dest = path.join(localRoot(), key);
      try {
        const bytes = await readFile(dest);
        const meta = JSON.parse(await readFile(dest + '.meta.json', 'utf8')) as { contentType: string };
        return { size: bytes.byteLength, body: new Uint8Array(bytes), httpMetadata: { contentType: meta.contentType }, arrayBuffer: async () => new Uint8Array(bytes).buffer };
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
        throw error;
      }
    }
    const result = await get('elite/' + key, { access: 'private', useCache: false, token: process.env.BLOB_READ_WRITE_TOKEN });
    if (!result?.stream) return null;
    const body = result.stream;
    return { size: result.blob.size, body, httpMetadata: { contentType: result.blob.contentType || 'application/octet-stream' }, arrayBuffer: () => new Response(body).arrayBuffer() };
  },
  async delete(key: string) {
    safeKey(key);
    if (local()) {
      const dest = path.join(localRoot(), key);
      await rm(dest, { force: true });
      await rm(dest + '.meta.json', { force: true });
      return;
    }
    await del('elite/' + key, { token: process.env.BLOB_READ_WRITE_TOKEN });
  },
};
