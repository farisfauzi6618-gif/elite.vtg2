import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto';
const kdf = { N: 16384, r: 8, p: 5, maxmem: 32 * 1024 * 1024 };
const derive = (password, salt) => new Promise((resolve, reject) => scrypt(password, salt, 32, kdf, (error, result) => error ? reject(error) : resolve(result)));
export async function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 128) throw new Error('Kata sandi harus 12–128 karakter.');
  const salt = randomBytes(16).toString('hex');
  return `scrypt$16384$8$5$${salt}$${(await derive(password, salt)).toString('hex')}`;
}
export async function verifyPassword(password, stored) {
  if (typeof password !== 'string' || password.length < 1 || password.length > 128) return false;
  const valid = typeof stored === 'string' && /^scrypt\$16384\$8\$5\$[a-f0-9]{32}\$[a-f0-9]{64}$/.test(stored);
  const parts = (valid ? stored : 'scrypt$16384$8$5$' + '0'.repeat(32) + '$' + '0'.repeat(64)).split('$');
  const derived = await derive(password, parts[4]);
  return timingSafeEqual(derived, Buffer.from(parts[5], 'hex')) && valid;
}
