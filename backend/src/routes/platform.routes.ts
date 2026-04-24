import { Router, Request, Response } from "express";
import { PrismaClient, JobStatus, UserRole } from "@prisma/client";
import { cache } from "../lib/cache";
import { asyncHandler } from "../middleware/error";

const router = Router();
const prisma = new PrismaClient();

const STATS_CACHE_KEY = "platform:stats";
const STATS_TTL_S = 60;

/**
 * GET /api/platform/stats
 * Public endpoint — no authentication required.
 * Returns aggregate platform metrics, cached in Redis for 60 s.
 */
router.get(
  "/stats",
  asyncHandler(async (_req: Request, res: Response) => {
    const { data, hit } = await cache(STATS_CACHE_KEY, STATS_TTL_S, async () => {
      const [
        totalJobs,
        openJobs,
        completedJobs,
        totalFreelancers,
        totalClients,
        volumeAgg,
      ] = await Promise.all([
        prisma.job.count(),
        prisma.job.count({ where: { status: JobStatus.OPEN } }),
        prisma.job.count({ where: { status: JobStatus.COMPLETED } }),
        prisma.user.count({ where: { role: UserRole.FREELANCER } }),
        prisma.user.count({ where: { role: UserRole.CLIENT } }),
        (prisma as any).transaction.aggregate({ _sum: { amount: true } }),
      ]);

      const totalVolumeXLM = volumeAgg._sum.amount ?? 0;
      const avgJobValueXLM = totalJobs > 0 ? totalVolumeXLM / totalJobs : 0;

      return {
        totalJobs,
        openJobs,
        completedJobs,
        totalFreelancers,
        totalClients,
        totalVolumeXLM,
        avgJobValueXLM: parseFloat(avgJobValueXLM.toFixed(7)),
      };
    });

    res.set("X-Cache-Hit", hit.toString());
    res.json(data);
  }),
);

export default router;
