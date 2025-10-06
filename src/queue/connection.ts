import IORedis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

// Redis connection configuration
const redisConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null, // Required for BullMQ
  retryStrategy(times: number) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
};

// Create Redis connection for BullMQ
export const redisConnection = new IORedis(redisConfig);

// Connection event handlers
redisConnection.on('connect', () => {
  console.log('✅ Redis connected successfully');
});

redisConnection.on('error', (err) => {
  console.error('❌ Redis connection error:', err);
});

redisConnection.on('close', () => {
  console.log('⚠️  Redis connection closed');
});

// Test Redis connection
export async function testRedisConnection(): Promise<boolean> {
  try {
    await redisConnection.ping();
    console.log('✅ Redis ping successful');
    return true;
  } catch (error) {
    console.error('❌ Redis ping failed:', error);
    return false;
  }
}

// Close Redis connection
export async function closeRedisConnection(): Promise<void> {
  await redisConnection.quit();
  console.log('Redis connection closed');
}

// Redis health check
export async function redisHealthCheck(): Promise<{
  healthy: boolean;
  details: {
    connected: boolean;
    latency?: number;
  };
}> {
  try {
    const start = Date.now();
    await redisConnection.ping();
    const latency = Date.now() - start;

    return {
      healthy: true,
      details: {
        connected: true,
        latency,
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
