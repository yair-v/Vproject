import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL;
const useSsl = Boolean(process.env.RENDER || process.env.PGSSLMODE === 'require' || connectionString?.includes('render.com'));

export const pool = new Pool({
  connectionString,
  ssl: useSsl ? { rejectUnauthorized: false } : false,
  max: Number(process.env.PGPOOL_MAX || 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

export async function query(text, params = []) {
  return pool.query(text, params);
}
