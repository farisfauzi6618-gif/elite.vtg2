import { createClient, type Client, type InValue, type ResultSet } from '@libsql/client';

type DatabaseState = { url: string; token: string | undefined; client: Client; database: SqlDatabase };
const state = globalThis as typeof globalThis & { __eliteDatabase?: DatabaseState };

function convert(result: ResultSet) {
  return {
    results: result.rows.map(row => Object.fromEntries(Object.entries(row))),
    success: true,
    meta: { changes: result.rowsAffected, last_row_id: Number(result.lastInsertRowid ?? 0) },
  };
}

/** The original prepared-query interface, backed by one libSQL database. */
export class SqlStatement {
  constructor(readonly client: Client, readonly sql: string, readonly args: InValue[] = []) {}
  bind(...args: unknown[]) {
    const values = args.map(value => {
      if (value === undefined || value === null) return null;
      if (typeof value === 'boolean') return Number(value);
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint' || value instanceof Uint8Array || value instanceof ArrayBuffer) return value;
      throw new Error('Invalid SQL value');
    });
    return new SqlStatement(this.client, this.sql, values);
  }
  async first<T = Record<string, unknown>>(column?: string): Promise<T | null> {
    const result = await this.client.execute({ sql: this.sql, args: this.args });
    if (!result.rows.length) return null;
    return (column ? result.rows[0][column] : Object.fromEntries(Object.entries(result.rows[0]))) as T;
  }
  async all<T = Record<string, unknown>>() {
    const result = convert(await this.client.execute({ sql: this.sql, args: this.args }));
    return { ...result, results: result.results as T[] };
  }
  async run() { return convert(await this.client.execute({ sql: this.sql, args: this.args })); }
}

export class SqlDatabase {
  constructor(readonly client: Client) {}
  prepare(sql: string) { return new SqlStatement(this.client, sql); }
  async batch(statements: SqlStatement[]) {
    if (statements.some(statement => statement.client !== this.client)) throw new Error('Database mismatch');
    if (!statements.length) return [];
    // libSQL batches commit all statements together, or roll all of them back.
    const results = await this.client.batch(statements.map(({ sql, args }) => ({ sql, args })), 'write');
    return results.map(convert);
  }
}

export function getDatabase() {
  const url = process.env.TURSO_DATABASE_URL?.trim() || (!process.env.VERCEL && process.env.NODE_ENV !== 'production' ? 'file:.data/elite.db' : '');
  if (!url) throw new Error('Set TURSO_DATABASE_URL before using the database.');
  if (process.env.VERCEL && url.startsWith('file:')) throw new Error('Vercel requires a remote persistent database.');
  const token = process.env.TURSO_AUTH_TOKEN;
  if (state.__eliteDatabase?.url !== url || state.__eliteDatabase.token !== token) {
    state.__eliteDatabase?.client.close();
    const client = createClient({ url, authToken: token, intMode: 'number' });
    state.__eliteDatabase = { url, token, client, database: new SqlDatabase(client) };
  }
  return state.__eliteDatabase.database;
}

export const getSqlClient = () => getDatabase().client;
