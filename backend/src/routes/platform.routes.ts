import { Router, Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { asyncHandler } from "../middleware/error";
import { cache } from "../lib/cache";

const router = Router();
const prisma = new PrismaClient();

/**
 * GET /api/platform/stats
 *
 * Publicly accessible aggregate statistics for the landing page (issue #283).
 * Returns only anonymised aggregate counts — no PII, no individual records.
 * Cached for 60 seconds to avoid hammering the DB on every page load.
 */
router.get(
  "/stats",
  asyncHandler(async (_req: Request, res: Response) => {
    const cacheKey = "platform:stats";

    const { data } = await cache(cacheKey, 60, async () => {
      const [
        totalJobs,
        openJobs,
        completedJobs,
        totalFreelancers,
        totalDisputes,
        resolvedDisputes,
        escrowAggregate,
      ] = await Promise.all([
        prisma.job.count(),
        prisma.job.count({ where: { status: "OPEN" } }),
        prisma.job.count({ where: { status: "COMPLETED" } }),
        prisma.user.count({ where: { role: "FREELANCER" } }),
        prisma.dispute.count(),
        prisma.dispute.count({
          where: { status: "RESOLVED" },
        }),
        prisma.job.aggregate({
          _sum: { budget: true },
          where: { status: { in: ["IN_PROGRESS", "COMPLETED"] } },
        }),
      ]);

      const totalEscrowXlm = escrowAggregate._sum.budget ?? 0;
      const resolvedDisputesPct =
        totalDisputes > 0
          ? Math.round((resolvedDisputes / totalDisputes) * 100)
          : 100;

      return {
        totalJobs,
        openJobs,
        completedJobs,
        totalFreelancers,
        totalEscrowXlm,
        resolvedDisputesPct,
      };
    });

    res.json(data);
  }),
);

export default router;
