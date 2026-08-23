import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn('⚠️ WARNING: DATABASE_URL is not set in your environment variables or .env file.');
}

const { Pool } = pg;

export const pool = new Pool({
  connectionString,
  ssl: connectionString && connectionString.includes('sslmode=disable')
    ? false
    : {
        rejectUnauthorized: false,
      },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client:', err);
});

export const query = async (text: string, params?: any[]) => {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  // console.log('Executed query', { text: text.slice(0, 80), duration, rows: res.rowCount });
  return res;
};

export const getClient = async () => {
  const client = await pool.connect();
  return client;
};

export default {
  pool,
  query,
  getClient,
};
