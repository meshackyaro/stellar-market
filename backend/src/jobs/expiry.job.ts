import { PrismaClient, JobStatus, EscrowStatus } from "@prisma/client";
import { NotificationService } from "../services/notification.service";

const prisma = new PrismaClient();

const ONE_HOUR_MS = 60 * 60 * 1000;

async function expireJobs(): Promise<void> {
  const now = new Date();
  console.log(`[ExpiryJob] Running at ${now.toISOString()}`);

  try {
    // 1. Open jobs past deadline → mark EXPIRED and notify client
    const openExpired = await prisma.job.findMany({
      where: {
        status: JobStatus.OPEN,
        deadline: { lt: now },
      },
      select: { id: true, title: true, clientId: true },
    });

    for (const job of openExpired) {
      await prisma.job.update({
        where: { id: job.id },
        data: { status: JobStatus.EXPIRED },
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
    const fundedExpired = await prisma.job.findMany({
      where: {
        escrowStatus: EscrowStatus.FUNDED,
        deadline: { lt: now },
        status: { notIn: [JobStatus.COMPLETED, JobStatus.CANCELLED, JobStatus.EXPIRED] },
      },
      select: { id: true, title: true, clientId: true, contractJobId: true },
    });

    for (const job of fundedExpired) {
      try {
        if (job.contractJobId) {
          // Placeholder: the on-chain expire_job entry point will be called here
          // once the contract expiry companion issue is merged.
          // await ContractService.buildExpireJobTx(job.contractJobId);
          console.log(`[ExpiryJob] expire_job stub for contract job ${job.contractJobId}`);
        }

        await prisma.job.update({
          where: { id: job.id },
          data: { status: JobStatus.EXPIRED },
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
  // Run once immediately at startup, then every hour
  expireJobs();
  setInterval(expireJobs, ONE_HOUR_MS);
  console.log("[ExpiryJob] Scheduled — runs every hour");
}
