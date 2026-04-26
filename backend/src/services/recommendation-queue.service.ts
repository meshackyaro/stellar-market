import Redis from "ioredis";
import RedisClient from "../lib/redis";
import { RecommendationService } from "./recommendation.service";
import { logger } from "../lib/logger";

const RECOMMENDATION_REBUILD_QUEUE_KEY = "queue:recommendations:rebuild";
const RECOMMENDATION_REBUILD_INTERVAL_MS = 2_000;

let workerTimer: NodeJS.Timeout | null = null;
let workerRunning = false;

type RecommendationRebuildJob = {
  jobId: string;
};

function getQueueConnection(): Redis {
  return RedisClient.getInstance();
}

async function enqueue(job: RecommendationRebuildJob): Promise<void> {
  try {
    if (!RedisClient.isRedisConnected()) {
      await RedisClient.connect();
    }

    await getQueueConnection().rpush(
      RECOMMENDATION_REBUILD_QUEUE_KEY,
      JSON.stringify(job),
    );
  } catch (error) {
    logger.warn({ err: error }, "Failed to enqueue recommendation rebuild job");
  }
}

async function drainQueueOnce(): Promise<void> {
  if (workerRunning) {
    return;
  }

  workerRunning = true;

  try {
    if (!RedisClient.isRedisConnected()) {
      await RedisClient.connect();
    }

    const redis = getQueueConnection();

    while (true) {
      const rawJob = await redis.lpop(RECOMMENDATION_REBUILD_QUEUE_KEY);
      if (!rawJob) {
        break;
      }

      try {
        const payload = JSON.parse(rawJob) as RecommendationRebuildJob;
        await RecommendationService.rebuildRecommendationsForJob(payload.jobId);
      } catch (error) {
        logger.error({ err: error }, "Failed to process recommendation rebuild job");
      }
    }
  } catch (error) {
    logger.warn({ err: error }, "Recommendation rebuild worker is unavailable");
  } finally {
    workerRunning = false;
  }
}

export class RecommendationQueueService {
  static async enqueueRebuild(jobId: string): Promise<void> {
    await enqueue({ jobId });
  }

  static startWorker(): void {
    if (workerTimer) {
      return;
    }

    workerTimer = setInterval(() => {
      void drainQueueOnce();
    }, RECOMMENDATION_REBUILD_INTERVAL_MS);
  }

  static stopWorker(): void {
    if (workerTimer) {
      clearInterval(workerTimer);
      workerTimer = null;
    }
  }
}
