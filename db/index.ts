import { drizzle } from 'drizzle-orm/libsql';
import { getSqlClient } from '@/lib/database';
import * as schema from './schema';
export const getDb = () => drizzle(getSqlClient(), { schema });
