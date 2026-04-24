import { PrismaClient } from "@prisma/client";
import { NotificationService } from "../services/notification.service";

const prisma = new PrismaClient();

const ONE_HOUR_MS = 60 * 60 * 1000;

async function expireJobs(): Promise<void> {
  const now = new Date();
  console.log(`[ExpiryJob] Running at ${now.toISOString()}`);

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

      console.log(`[ExpiryJob] Marked OPEN job ${job.id} as EXPIRED`);
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
          console.log(`[ExpiryJob] expire_job stub for contract job ${job.contractJobId}`);
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

        console.log(`[ExpiryJob] Marked FUNDED job ${job.id} as EXPIRED`);
      } catch (err) {
        console.error(`[ExpiryJob] Failed to expire funded job ${job.id}:`, err);
      }
    }

    console.log(
      `[ExpiryJob] Done — expired ${openExpired.length} open and ${fundedExpired.length} funded jobs`,
    );
  } catch (err) {
    console.error("[ExpiryJob] Unhandled error:", err);
  }
}

export function startExpiryJob(): void {
  expireJobs();
  setInterval(expireJobs, ONE_HOUR_MS);
  console.log("[ExpiryJob] Scheduled — runs every hour");
}
