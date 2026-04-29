import Redis from "ioredis";
import { logger } from "./logger";

class RedisClient {
  private static instance: Redis;
  private static isConnected: boolean = false;

  private constructor() {}

  public static getInstance(): Redis {
    if (!RedisClient.instance) {
      const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
      
      RedisClient.instance = new Redis(redisUrl, {
        maxRetriesPerRequest: 3,
        lazyConnect: true,
        enableReadyCheck: true,
        reconnectOnError: (err) => {
          const targetError = "READONLY";
          return err.message.includes(targetError);
        },
      });

      RedisClient.instance.on("connect", () => {
        logger.info("Redis connected successfully");
        RedisClient.isConnected = true;
      });

      RedisClient.instance.on("error", (err) => {
        logger.error({ err }, "Redis connection error");
        RedisClient.isConnected = false;
      });

      RedisClient.instance.on("close", () => {
        logger.info("Redis connection closed");
        RedisClient.isConnected = false;
      });

      RedisClient.instance.on("reconnecting", () => {
        logger.warn("Redis reconnecting...");
      });
    }

    return RedisClient.instance;
  }

  public static async connect(): Promise<void> {
    const client = RedisClient.getInstance();
    if (!client.status || client.status === "end") {
      await client.connect();
    }
  }

  public static isRedisConnected(): boolean {
    return RedisClient.isConnected && RedisClient.instance.status === "ready";
  }

  public static async disconnect(): Promise<void> {
    if (RedisClient.instance) {
      await RedisClient.instance.quit();
    }
  }
}

export default RedisClient;
