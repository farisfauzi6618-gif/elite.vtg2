import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { hashPassword } from '../lib/auth/password.mjs';

if (process.argv.length > 2) throw new Error('Do not pass passwords in command-line arguments.');
if (!process.stdin.isTTY) {
  let password = '';
  for await (const part of process.stdin) password += part;
  console.log(await hashPassword(password.replace(/\r?\n$/, '')));
} else {
  let muted = false;
  const output = new Writable({ write(chunk, encoding, callback) { if (!muted) process.stdout.write(chunk, encoding); callback(); } });
  const rl = createInterface({ input: process.stdin, output, terminal: true });
  try {
    process.stdout.write('Kata sandi pemilik (12–128 karakter): ');
    muted = true;
    const password = await rl.question('');
    process.stdout.write('\nUlangi kata sandi: ');
    const repeated = await rl.question('');
    if (password !== repeated) throw new Error('Kata sandi tidak sama.');
    process.stdout.write('\n\n' + await hashPassword(password) + '\n');
  } finally { rl.close(); }
}
