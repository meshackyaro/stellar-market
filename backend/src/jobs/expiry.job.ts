import { PrismaClient } from "@prisma/client";
import { NotificationService } from "../services/notification.service";
import { logger } from "../lib/logger";

const prisma = new PrismaClient();

const ONE_HOUR_MS = 60 * 60 * 1000;

async function expireJobs(): Promise<void> {
  const now = new Date();
  logger.info({ at: now.toISOString() }, "[ExpiryJob] Running");

  try {
    // 1. Open jobs past deadline → mark EXPIRED and notify client
    const openExpired = await (prisma.job as any).findMany({
      where: {
        status: "OPEN",
        deadline: { lt: now },
      },
      select: { id: true, title: true, clientId: true },
    });

    for (const job of openExpired) {
      await (prisma.job as any).update({
        where: { id: job.id },
        data: { status: "EXPIRED" },
      });

      await NotificationService.sendNotification({
        userId: job.clientId,
        type: "CANCELLED" as any,
        title: "Job Expired",
        message: `Your job "${job.title}" has expired without being funded and has been closed.`,
      });

      logger.info({ jobId: job.id }, "[ExpiryJob] Marked OPEN job as EXPIRED");
    }

    // 2. Funded jobs past deadline → call expire_job on-chain then mark EXPIRED
    const fundedExpired = await (prisma.job as any).findMany({
      where: {
        escrowStatus: "FUNDED",
        deadline: { lt: now },
        status: { notIn: ["COMPLETED", "CANCELLED", "EXPIRED"] },
      },
      select: { id: true, title: true, clientId: true, contractJobId: true },
    });

    for (const job of fundedExpired) {
      try {
        if (job.contractJobId) {
          // Placeholder: on-chain expire_job will be wired here once the
          // companion contract issue is merged.
          logger.info(
            { contractJobId: job.contractJobId },
            "[ExpiryJob] expire_job stub for contract job",
          );
        }

        await (prisma.job as any).update({
          where: { id: job.id },
          data: { status: "EXPIRED" },
        });

        await NotificationService.sendNotification({
          userId: job.clientId,
          type: "CANCELLED" as any,
          title: "Funded Job Expired",
          message: `Your funded job "${job.title}" passed its deadline and has been marked as expired. Escrow refund will be processed.`,
        });

        logger.info({ jobId: job.id }, "[ExpiryJob] Marked FUNDED job as EXPIRED");
      } catch (err) {
        logger.error({ err, jobId: job.id }, "[ExpiryJob] Failed to expire funded job");
      }
    }

    logger.info(
      { openExpired: openExpired.length, fundedExpired: fundedExpired.length },
      "[ExpiryJob] Done",
    );
  } catch (err) {
    logger.error({ err }, "[ExpiryJob] Unhandled error");
  }
}

export function startExpiryJob(): void {
  expireJobs();
  setInterval(expireJobs, ONE_HOUR_MS);
  logger.info("[ExpiryJob] Scheduled — runs every hour");
}
