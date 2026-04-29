import { Router, Response } from "express";
import { PrismaClient } from "@prisma/client";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { authenticate, AuthRequest } from "../middleware/auth";
import { asyncHandler } from "../middleware/error";
import { validate } from "../middleware/validation";

const router = Router();
const prisma = new PrismaClient();

const AUTO_FLAG_THRESHOLD = 3;

const reportRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => (req as AuthRequest).userId ?? req.ip ?? "anon",
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({ error: "Report limit reached — you may submit up to 5 reports per hour" });
  },
});

const TARGET_TYPES = ["JOB", "USER", "MESSAGE"] as const;

const createReportSchema = z.object({
  targetType: z.enum(TARGET_TYPES),
  targetId: z.string().min(1),
  reason: z.string().min(10, "Reason must be at least 10 characters").max(1000),
});

/**
 * POST /api/reports
 * Authenticated; rate-limited to 5 per user per hour.
 */
router.post(
  "/",
  authenticate,
  reportRateLimiter,
  validate({ body: createReportSchema }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { targetType, targetId, reason } = req.body as {
      targetType: (typeof TARGET_TYPES)[number];
      targetId: string;
      reason: string;
    };

    const report = await (prisma as any).report.create({
      data: {
        reporterId: req.userId!,
        targetType,
        targetId,
        reason,
      },
    });

    // Auto-flag user when they accumulate >= AUTO_FLAG_THRESHOLD pending reports
    if (targetType === "USER") {
      const pendingCount = await (prisma as any).report.count({
        where: { targetId, targetType: "USER", status: "PENDING" },
      });

      if (pendingCount >= AUTO_FLAG_THRESHOLD) {
        await (prisma.user as any).update({
          where: { id: targetId },
          data: {
            isFlagged: true,
            flagReason: `Auto-flagged: ${pendingCount} pending community reports`,
          },
        });
      }
    }

    res.status(201).json({ report });
  }),
);

export default router;
