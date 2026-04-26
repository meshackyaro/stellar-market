import type { PrismaClient } from "@prisma/client";
import RedisClient from "./redis";
import { logger } from "./logger";

export type DependencyHealthStatus = "ok" | "error";

export type HealthResponse = {
  status: "ok" | "degraded";
  service: "stellarmarket-api";
  checks: {
    database: DependencyHealthStatus;
    redis: DependencyHealthStatus;
  };
};

export async function getHealthStatus(
  prisma: Pick<PrismaClient, "$queryRawUnsafe">,
): Promise<HealthResponse> {
  const checks: HealthResponse["checks"] = {
    database: "ok",
    redis: "ok",
  };

  try {
    await prisma.$queryRawUnsafe("SELECT 1");
  } catch (error) {
    checks.database = "error";
    logger.error({ err: error }, "Health check database probe failed");
  }

  try {
    if (!RedisClient.isRedisConnected()) {
      await RedisClient.connect();
    }
    await RedisClient.getInstance().ping();
  } catch (error) {
    checks.redis = "error";
    logger.error({ err: error }, "Health check Redis probe failed");
  }

  const healthy = Object.values(checks).every((value) => value === "ok");

  return {
    status: healthy ? "ok" : "degraded",
    service: "stellarmarket-api",
    checks,
  };
}
