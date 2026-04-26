import { rpc, scValToNative } from "@stellar/stellar-sdk";
import { PrismaClient, BadgeTier } from "@prisma/client";
import { config } from "../config";
import { NotificationService } from "./notification.service";
import { logger } from "../lib/logger";

const prisma = new PrismaClient();
const server = new rpc.Server(config.stellar.rpcUrl);

const POLL_INTERVAL_MS = 5_000;
const MAX_EVENTS_PER_POLL = 200;
const SYNC_STATE_ID = "default";

type SorobanEvent = Awaited<ReturnType<typeof server.getEvents>>["events"][number];

// ─── helpers ──────────────────────────────────────────────────────────────────

function topicToStrings(event: SorobanEvent): string[] {
  return event.topic.map((t) => String(scValToNative(t) ?? ""));
}

/** Handles both plain-string and single-element-array Soroban enum variants. */
function enumVariant(raw: unknown): string {
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw) && raw.length > 0) return String(raw[0]);
  return String(raw ?? "");
}

function bigintToStr(v: unknown): string {
  return typeof v === "bigint" ? v.toString() : String(v ?? "");
}

function toBadgeTier(raw: unknown): BadgeTier | null {
  const v = enumVariant(raw).toUpperCase();
  if (v === "BRONZE") return BadgeTier.BRONZE;
  if (v === "SILVER") return BadgeTier.SILVER;
  if (v === "GOLD") return BadgeTier.GOLD;
  if (v === "PLATINUM") return BadgeTier.PLATINUM;
  return null;
}

// ─── sync-state persistence ───────────────────────────────────────────────────

async function getLastIndexedLedger(): Promise<number> {
  const row = await prisma.syncState.upsert({
    where: { id: SYNC_STATE_ID },
    update: {},
    create: { id: SYNC_STATE_ID, lastIndexedLedger: 0 },
  });
  return row.lastIndexedLedger;
}

async function setLastIndexedLedger(ledger: number): Promise<void> {
  await prisma.syncState.upsert({
    where: { id: SYNC_STATE_ID },
    update: { lastIndexedLedger: ledger },
    create: { id: SYNC_STATE_ID, lastIndexedLedger: ledger },
  });
}

// ─── event handlers ───────────────────────────────────────────────────────────

/**
 * escrow / created — (job_count: u64, client: Address, freelancer: Address)
 *
 * The on-chain job was successfully created.  Find the matching DB row by
 * contractJobId and confirm its escrow status is UNFUNDED.  Handles the case
 * where the backend was down when the frontend submitted the transaction.
 */
async function handleJobCreated(event: SorobanEvent): Promise<void> {
  const data = scValToNative(event.value) as unknown[];
  if (!Array.isArray(data) || data.length < 1) return;

  const onChainJobId = bigintToStr(data[0]);

  await prisma.job.updateMany({
    where: {
      contractJobId: onChainJobId,
      escrowStatus: { not: "FUNDED" },
    },
    data: { escrowStatus: "UNFUNDED" },
  });

  logger.info({ contractJobId: onChainJobId }, "[HorizonListener] JobCreated");
}

/**
 * escrow / funded — (job_id: u64, client: Address)
 *
 * Escrow has been funded.  Transition the job to IN_PROGRESS / FUNDED.
 */
async function handleJobFunded(event: SorobanEvent): Promise<void> {
  const data = scValToNative(event.value) as unknown[];
  if (!Array.isArray(data) || data.length < 1) return;

  const onChainJobId = bigintToStr(data[0]);

  await prisma.job.updateMany({
    where: {
      contractJobId: onChainJobId,
      escrowStatus: "UNFUNDED",
    },
    data: { escrowStatus: "FUNDED", status: "IN_PROGRESS" },
  });

  logger.info({ contractJobId: onChainJobId }, "[HorizonListener] JobFunded");
}

/**
 * escrow / pmt_released — (job_id: u64, freelancer: Address, amount: i128)
 *
 * All milestone payments released; job is complete.
 */
async function handlePaymentReleased(event: SorobanEvent): Promise<void> {
  const data = scValToNative(event.value) as unknown[];
  if (!Array.isArray(data) || data.length < 1) return;

  const onChainJobId = bigintToStr(data[0]);

  const updated = await prisma.job.updateMany({
    where: {
      contractJobId: onChainJobId,
      status: { not: "COMPLETED" },
    },
    data: { escrowStatus: "COMPLETED", status: "COMPLETED" },
  });

  if (updated.count > 0) {
    // Notify both parties
    const job = await prisma.job.findFirst({
      where: { contractJobId: onChainJobId },
      select: { clientId: true, freelancerId: true, title: true },
    });
    if (job) {
      const notifyIds = [job.clientId, job.freelancerId].filter(Boolean) as string[];
      await Promise.all(
        notifyIds.map((userId) =>
          NotificationService.sendNotification({
            userId,
            type: "PAYMENT_RELEASED",
            title: "Payment Released",
            message: `All payments for "${job.title}" have been released on-chain.`,
            metadata: { contractJobId: onChainJobId },
            skipBatching: true,
          })
        )
      );
    }
  }

  logger.info({ contractJobId: onChainJobId }, "[HorizonListener] PaymentReleased");
}

/**
 * dispute / raised — (dispute_id: u64, job_id: u64, initiator: Address)
 *
 * A dispute was opened on-chain.  Upsert the DB Dispute record and set the
 * job status to DISPUTED.
 */
async function handleDisputeOpened(event: SorobanEvent): Promise<void> {
  const data = scValToNative(event.value) as unknown[];
  if (!Array.isArray(data) || data.length < 3) return;

  const onChainDisputeId = bigintToStr(data[0]);
  const onChainJobId = bigintToStr(data[1]);

  // Find the job in DB by contractJobId
  const job = await prisma.job.findFirst({
    where: { contractJobId: onChainJobId },
    select: { id: true, clientId: true, freelancerId: true, dispute: true },
  });

  if (!job) {
    logger.warn({ contractJobId: onChainJobId }, "[HorizonListener] DisputeOpened — no DB job");
    return;
  }

  // Mark job as DISPUTED
  await prisma.job.update({
    where: { id: job.id },
    data: { status: "DISPUTED", escrowStatus: "DISPUTED" },
  });

  // Upsert dispute record — idempotent via onChainDisputeId unique constraint
  await prisma.dispute.upsert({
    where: { onChainDisputeId },
    update: { status: "OPEN" },
    create: {
      jobId: job.id,
      onChainDisputeId,
      clientId: job.clientId,
      freelancerId: job.freelancerId ?? job.clientId,
      initiatorId: job.clientId,
      reason: "Raised on-chain",
      status: "OPEN",
    },
  });

  // Notify both parties
  const notifyIds = [job.clientId, job.freelancerId].filter(Boolean) as string[];
  await Promise.all(
    notifyIds.map((userId) =>
      NotificationService.sendNotification({
        userId,
        type: "DISPUTE_RAISED",
        title: "Dispute Opened",
        message: "A dispute has been opened on-chain for your job.",
        metadata: { onChainDisputeId, contractJobId: onChainJobId },
      })
    )
  );

  logger.info({ onChainDisputeId }, "[HorizonListener] DisputeOpened");
}

/**
 * dispute / resolved — (dispute_id: u64, dispute_status: DisputeStatus)
 *
 * Voting concluded and the dispute has been resolved on-chain.
 */
async function handleDisputeResolved(event: SorobanEvent): Promise<void> {
  const data = scValToNative(event.value) as unknown[];
  if (!Array.isArray(data) || data.length < 2) return;

  const onChainDisputeId = bigintToStr(data[0]);
  const rawStatus = enumVariant(data[1]);

  // Map on-chain DisputeStatus variants to DB DisputeStatus + job outcomes
  let dbDisputeStatus: "OPEN" | "IN_PROGRESS" | "RESOLVED" = "RESOLVED";
  let jobStatus: "COMPLETED" | "CANCELLED" | null = null;
  let outcome: string = rawStatus;

  if (rawStatus === "ResolvedForClient") {
    jobStatus = "CANCELLED";
    outcome = "CLIENT_WINS";
  } else if (rawStatus === "ResolvedForFreelancer") {
    jobStatus = "COMPLETED";
    outcome = "FREELANCER_WINS";
  } else if (rawStatus === "RefundedBoth") {
    jobStatus = "CANCELLED";
    outcome = "REFUND_BOTH";
  } else if (rawStatus === "Escalated") {
    dbDisputeStatus = "IN_PROGRESS";
    outcome = "ESCALATED";
  }

  const dispute = await prisma.dispute.findUnique({
    where: { onChainDisputeId },
    select: { id: true, jobId: true, clientId: true, freelancerId: true },
  });

  if (!dispute) {
    logger.warn(
      { onChainDisputeId },
      "[HorizonListener] DisputeResolved — no DB dispute",
    );
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.dispute.update({
      where: { id: dispute.id },
      data: {
        status: dbDisputeStatus,
        outcome,
        resolvedAt: dbDisputeStatus === "RESOLVED" ? new Date() : null,
      },
    });

    if (jobStatus) {
      await tx.job.update({
        where: { id: dispute.jobId },
        data: {
          status: jobStatus,
          escrowStatus: jobStatus === "COMPLETED" ? "COMPLETED" : "CANCELLED",
        },
      });
    }
  });

  // Notify both parties
  const notifyIds = [dispute.clientId, dispute.freelancerId].filter(Boolean) as string[];
  await Promise.all(
    notifyIds.map((userId) =>
      NotificationService.sendNotification({
        userId,
        type: "DISPUTE_RESOLVED",
        title: "Dispute Resolved",
        message: `The dispute has been resolved on-chain: ${outcome}.`,
        metadata: { onChainDisputeId, outcome },
      })
    )
  );

  logger.info({ onChainDisputeId, outcome }, "[HorizonListener] DisputeResolved");
}

/**
 * reput / badge — (user_address: Address, tier: ReputationTier)
 *
 * A reputation badge was awarded on-chain.  Upsert the DB Badge record and
 * notify the user.
 */
async function handleBadgeAwarded(event: SorobanEvent): Promise<void> {
  const data = scValToNative(event.value) as unknown[];
  if (!Array.isArray(data) || data.length < 2) return;

  const walletAddress = String(data[0] ?? "");
  const tier = toBadgeTier(data[1]);

  if (!walletAddress || !tier) return;

  const user = await prisma.user.findUnique({
    where: { walletAddress },
    select: { id: true },
  });

  if (!user) {
    logger.warn({ walletAddress }, "[HorizonListener] BadgeAwarded — no user");
    return;
  }

  const result = await prisma.badge.upsert({
    where: { userId_tier: { userId: user.id, tier } },
    update: {},
    create: {
      userId: user.id,
      tier,
      awardedLedger: event.ledger,
    },
  });

  // Only notify on first award (upsert created a new row means awardedLedger changed)
  if (result.awardedLedger === event.ledger) {
    await NotificationService.sendNotification({
      userId: user.id,
      type: "BADGE_AWARDED",
      title: `${tier.charAt(0) + tier.slice(1).toLowerCase()} Badge Earned!`,
      message: `Congratulations! You earned a ${tier.toLowerCase()} reputation badge on-chain.`,
      metadata: { tier, awardedLedger: event.ledger },
      skipBatching: true,
    });
  }

  logger.info({ walletAddress, tier }, "[HorizonListener] BadgeAwarded");
}

// ─── event dispatch ───────────────────────────────────────────────────────────

async function processEvent(event: SorobanEvent): Promise<void> {
  const [contract, name] = topicToStrings(event);

  try {
    if (contract === "escrow") {
      if (name === "created") return await handleJobCreated(event);
      if (name === "funded") return await handleJobFunded(event);
      if (name === "pmt_released") return await handlePaymentReleased(event);
    }

    if (contract === "dispute") {
      if (name === "raised") return await handleDisputeOpened(event);
      if (name === "resolved") return await handleDisputeResolved(event);
    }

    if (contract === "reput") {
      if (name === "badge") return await handleBadgeAwarded(event);
    }
  } catch (err) {
    logger.error(
      { err, contract, name, ledger: event.ledger },
      "[HorizonListener] Error processing event",
    );
  }
}

// ─── polling loop ─────────────────────────────────────────────────────────────

async function poll(): Promise<void> {
  const contractIds = [
    config.stellar.escrowContractId,
    config.stellar.disputeContractId,
    config.stellar.reputationContractId,
  ].filter(Boolean);

  if (contractIds.length === 0) {
    return;
  }

  const lastLedger = await getLastIndexedLedger();

  let startLedger: number;
  try {
    const latest = await server.getLatestLedger();
    if (lastLedger === 0) {
      // First run — start from the current tip so we don't replay all history
      startLedger = latest.sequence;
      await setLastIndexedLedger(startLedger);
      logger.info({ startLedger }, "[HorizonListener] First run — starting from ledger");
      return;
    }
    startLedger = lastLedger + 1;

    if (startLedger > latest.sequence) {
      return; // nothing new
    }
  } catch (err) {
    logger.error({ err }, "[HorizonListener] Failed to fetch latest ledger");
    return;
  }

  let events: SorobanEvent[] = [];
  let maxEventLedger = lastLedger;

  try {
    const result = await server.getEvents({
      startLedger,
      filters: [{ type: "contract", contractIds }],
      limit: MAX_EVENTS_PER_POLL,
    });
    events = result.events;
  } catch (err: any) {
    // Soroban RPC returns an error when startLedger is before the retention window.
    // Reset to the latest ledger so we don't loop on the same bad cursor.
    const msg: string = err?.message ?? "";
    if (msg.includes("startLedger") || msg.includes("ledger")) {
      logger.warn("[HorizonListener] startLedger out of retention window, resetting cursor");
      try {
        const latest = await server.getLatestLedger();
        await setLastIndexedLedger(latest.sequence);
      } catch (_) {}
    } else {
      logger.error({ err }, "[HorizonListener] getEvents error");
    }
    return;
  }

  for (const event of events) {
    await processEvent(event);
    if (event.ledger > maxEventLedger) maxEventLedger = event.ledger;
  }

  if (maxEventLedger > lastLedger) {
    await setLastIndexedLedger(maxEventLedger);
  }
}

// ─── public API ───────────────────────────────────────────────────────────────

let intervalId: NodeJS.Timeout | null = null;

export function startHorizonListener(): void {
  if (intervalId) return;

  const contractIds = [
    config.stellar.escrowContractId,
    config.stellar.disputeContractId,
    config.stellar.reputationContractId,
  ].filter(Boolean);

  if (contractIds.length === 0) {
    logger.info("[HorizonListener] No contract IDs configured — skipping");
    return;
  }

  logger.info(
    { intervalSeconds: POLL_INTERVAL_MS / 1_000 },
    "[HorizonListener] Starting",
  );
  logger.info({ contractIds }, "[HorizonListener] Watching contracts");

  poll();
  intervalId = setInterval(() => void poll(), POLL_INTERVAL_MS);
}

export function stopHorizonListener(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    logger.info("[HorizonListener] Stopped");
  }
}
