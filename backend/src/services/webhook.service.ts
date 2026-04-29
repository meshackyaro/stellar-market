import crypto from "crypto";
import { PrismaClient } from "@prisma/client";
import { logger } from "../lib/logger";

const prisma = new PrismaClient();

const SUPPORTED_EVENTS = ["job.status_changed", "milestone.approved"] as const;
export type WebhookEvent = (typeof SUPPORTED_EVENTS)[number];

const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [30_000, 120_000, 600_000]; // 30s, 2min, 10min

function signPayload(secret: string, body: string): string {
  return crypto.createHmac("sha256", secret).update(body).digest("hex");
}

export class WebhookService {
  static isSupportedEvent(event: string): event is WebhookEvent {
    return (SUPPORTED_EVENTS as readonly string[]).includes(event);
  }

  static listSupportedEvents(): readonly string[] {
    return SUPPORTED_EVENTS;
  }

  static async register(userId: string, url: string, event: string) {
    const secret = crypto.randomBytes(32).toString("hex");
    return prisma.webhook.create({
      data: { userId, url, event, secret },
      select: { id: true, url: true, event: true, active: true, createdAt: true },
    });
  }

  static async listForUser(userId: string) {
    return prisma.webhook.findMany({
      where: { userId },
      select: { id: true, url: true, event: true, active: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });
  }

  static async deleteForUser(id: string, userId: string) {
    return prisma.webhook.deleteMany({ where: { id, userId } });
  }

  /**
   * Enqueues a delivery for every active webhook registered for the given event.
   * Call this whenever a tracked event fires (e.g. job status change).
   */
  static async trigger(event: WebhookEvent, payload: Record<string, unknown>) {
    const webhooks = await prisma.webhook.findMany({
      where: { event, active: true },
    });

    await Promise.all(
      webhooks.map(async (wh) => {
        const delivery = await prisma.webhookDelivery.create({
          data: { webhookId: wh.id, event, payload, status: "pending" },
        });
        void this.deliver(delivery.id);
      }),
    );
  }

  /**
   * Attempts to deliver a single WebhookDelivery record, retrying with exponential backoff.
   */
  static async deliver(deliveryId: string): Promise<void> {
    const delivery = await prisma.webhookDelivery.findUnique({
      where: { id: deliveryId },
      include: { webhook: true },
    });

    if (!delivery || !delivery.webhook.active) return;
    if (delivery.attempts >= MAX_ATTEMPTS) return;

    const body = JSON.stringify({ event: delivery.event, data: delivery.payload });
    const signature = signPayload(delivery.webhook.secret, body);

    let responseCode: number | null = null;
    let success = false;

    try {
      const response = await fetch(delivery.webhook.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-StellarMarket-Signature": `sha256=${signature}`,
          "X-StellarMarket-Event": delivery.event,
        },
        body,
        signal: AbortSignal.timeout(10_000),
      });
      responseCode = response.status;
      success = response.ok;
    } catch (err) {
      logger.warn({ err, deliveryId }, "Webhook delivery network error");
    }

    const attempts = delivery.attempts + 1;
    const status = success ? "success" : attempts >= MAX_ATTEMPTS ? "failed" : "pending";
    const nextRetry =
      !success && attempts < MAX_ATTEMPTS
        ? new Date(Date.now() + RETRY_DELAYS_MS[attempts - 1])
        : null;

    await prisma.webhookDelivery.update({
      where: { id: deliveryId },
      data: {
        attempts,
        status,
        lastAttempt: new Date(),
        nextRetry,
        responseCode,
      },
    });

    if (!success && nextRetry) {
      const delay = nextRetry.getTime() - Date.now();
      setTimeout(() => void WebhookService.deliver(deliveryId), delay);
    }
  }
}
