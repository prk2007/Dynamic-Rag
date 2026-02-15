import { Pool, PoolClient, QueryResult } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// Database configuration
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER || 'rag_user',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'dynamic_rag',
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
};

// Create connection pool
export const pool = new Pool(dbConfig);

// Pool error handling
pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client', err);
  process.exit(-1);
});

// Helper function to execute queries
export async function query<T = any>(
  text: string,
  params?: any[]
): Promise<QueryResult<T>> {
  const start = Date.now();
  try {
    const res = await pool.query<T>(text, params);
    const duration = Date.now() - start;
    if (process.env.LOG_LEVEL === 'debug') {
      console.log('Executed query', { text, duration, rows: res.rowCount });
    }
    return res;
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
}

// Helper function to get a client from the pool
export async function getClient(): Promise<PoolClient> {
  return await pool.connect();
}

// Helper function for transactions
export async function transaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// Close pool gracefully
export async function closePool(): Promise<void> {
  await pool.end();
  console.log('PostgreSQL pool closed');
}

// Test database connection
export async function testConnection(): Promise<boolean> {
  try {
    const result = await query('SELECT NOW() as now');
    console.log('✅ PostgreSQL connected successfully');
    console.log(`   Server time: ${result.rows[0].now}`);
    return true;
  } catch (error) {
    console.error('❌ PostgreSQL connection failed:', error);
    return false;
  }
}

// Database health check
export async function healthCheck(): Promise<{
  healthy: boolean;
  details: {
    connected: boolean;
    totalClients?: number;
    idleClients?: number;
    waitingClients?: number;
  };
}> {
  try {
    await query('SELECT 1');
    return {
      healthy: true,
      details: {
        connected: true,
        totalClients: pool.totalCount,
        idleClients: pool.idleCount,
        waitingClients: pool.waitingCount,
      },
    };
  } catch (error) {
    return {
      healthy: false,
      details: {
        connected: false,
      },
    };
  }
}
