import { Router, Response } from "express";
import { z } from "zod";
import { authenticate, AuthRequest } from "../middleware/auth";
import { validate } from "../middleware/validation";
import { asyncHandler } from "../middleware/error";
import { WebhookService } from "../services/webhook.service";

const router = Router();

const createWebhookSchema = z.object({
  url: z.string().url("url must be a valid URL"),
  event: z.string().refine(WebhookService.isSupportedEvent, {
    message: `event must be one of: ${WebhookService.listSupportedEvents().join(", ")}`,
  }),
});

const webhookIdSchema = z.object({ id: z.string().cuid() });

router.post(
  "/",
  authenticate,
  validate({ body: createWebhookSchema }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { url, event } = req.body as { url: string; event: string };
    const webhook = await WebhookService.register(req.userId!, url, event);
    res.status(201).json(webhook);
  }),
);

router.get(
  "/",
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const webhooks = await WebhookService.listForUser(req.userId!);
    res.json(webhooks);
  }),
);

router.delete(
  "/:id",
  authenticate,
  validate({ params: webhookIdSchema }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id } = req.params as { id: string };
    const result = await WebhookService.deleteForUser(id, req.userId!);
    if (result.count === 0) {
      return res.status(404).json({ error: "Webhook not found." });
    }
    res.status(204).send();
  }),
);

export default router;
