import Redis from "ioredis";
import { logger } from "../lib/logger";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

let redis: Redis | null = null;

/**
 * Returns the Redis client singleton.
 * Lazily connects on first call. Returns null if Redis is unavailable,
 * allowing the app to function without caching.
 */
export function getRedisClient(): Redis | null {
  if (redis) return redis;

  try {
    redis = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      retryStrategy(times) {
        if (times > 3) return null;
        return Math.min(times * 200, 2000);
      },
    });

    redis.on("error", (err) => {
      logger.warn({ err }, "Redis connection error (caching disabled)");
    });

    redis.connect().catch(() => {
      // Silently fail — caching is optional
      redis = null;
    });

    return redis;
  } catch {
    return null;
  }
}

/** Cache key prefix for recommendation results */
export const RECOMMENDATION_CACHE_PREFIX = "recommendations:";

/** Cache TTL in seconds (10 minutes) */
export const RECOMMENDATION_CACHE_TTL = 600;
