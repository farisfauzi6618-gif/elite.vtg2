import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';

export async function migrate(client, directory, { check = false } = {}) {
  await client.execute('PRAGMA foreign_keys=ON');
  await client.execute('CREATE TABLE IF NOT EXISTS elite_migrations(name TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at INTEGER NOT NULL)');
  const applied = new Map((await client.execute('SELECT name,checksum FROM elite_migrations')).rows.map(row => [row.name, row.checksum]));
  const files = (await readdir(directory)).filter(name => name.endsWith('.sql')).sort();
  const pending = [];
  for (const name of files) {
    const text = await readFile(new URL(name, directory), 'utf8');
    const checksum = createHash('sha256').update(text).digest('hex');
    if (applied.has(name)) {
      if (applied.get(name) !== checksum) throw new Error('Applied migration changed: ' + name);
      continue;
    }
    pending.push(name);
    if (check) continue;
    const statements = text.split('--> statement-breakpoint').flatMap(part => part.split(';')).map(sql => sql.trim()).filter(Boolean);
    await client.batch([...statements.map(sql => ({ sql, args: [] })), { sql: 'INSERT INTO elite_migrations(name,checksum,applied_at) VALUES(?,?,?)', args: [name, checksum, Date.now()] }], 'write');
  }
  return { pending, total: files.length };
}
