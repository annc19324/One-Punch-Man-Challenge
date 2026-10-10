import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

export const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'opm_challenge',
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('[DB Error] Unexpected error on idle client:', err.message);
});

export const query = async (text, params) => {
  try {
    const res = await pool.query(text, params);
    return res;
  } catch (error) {
    console.error(`[DB Query Error] Query: "${text}" | Error: ${error.message}`);
    throw error;
  }
};

export const testConnection = async () => {
  try {
    const client = await pool.connect();
    console.log('✅ PostgreSQL connected successfully to:', process.env.DB_NAME || 'opm_challenge');
    client.release();
    return true;
  } catch (error) {
    console.warn('⚠️ Warning: PostgreSQL not reachable yet:', error.message);
    console.warn('👉 Note: Please check your DB credentials in .env or run PostgreSQL when ready.');
    return false;
  }
};
