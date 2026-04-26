import { Router, Response } from "express";
import { PrismaClient, NotificationType } from "@prisma/client";
import { authenticate, AuthRequest } from "../middleware/auth";
import { validate } from "../middleware/validation";
import { asyncHandler } from "../middleware/error";
import { NotificationService } from "../services/notification.service";
import { logger } from "../lib/logger";
import {
  createMessageSchema,
  updateMessageSchema,
  getMessagesQuerySchema,
  getMessageByIdParamSchema,
  markMessageAsReadSchema,
} from "../schemas";

const router = Router();
/**
 * @swagger
 * tags:
 *   name: Messages
 *   description: Messaging endpoints
 */
const prisma = new PrismaClient();

// Send a message
router.post(
  /**
   * @swagger
   * /messages:
   *   post:
   *     summary: Send a message
   *     tags: [Messages]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/CreateMessageRequest'
   *           examples:
   *             example:
   *               value:
   *                 receiverId: "uuid"
   *                 jobId: "uuid"
   *                 content: "Hello!"
   *     responses:
   *       201:
   *         description: Message sent
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/MessageResponse'
   */
  /**
   * @swagger
   * /messages:
   *   get:
   *     summary: Get messages
   *     tags: [Messages]
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: List of messages
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/MessagesResponse'
   */
  "/",
  authenticate,
  validate({ body: createMessageSchema }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { receiverId, jobId, content } = req.body;

    const message = await prisma.message.create({
      data: {
        senderId: req.userId!,
        receiverId,
        jobId: jobId || null,
        content,
      },
      include: {
        sender: { select: { id: true, username: true, avatarUrl: true } },
        receiver: { select: { id: true, username: true, avatarUrl: true } },
      },
    });

    // Notify the receiver
    await NotificationService.sendNotification({
      userId: receiverId,
      type: NotificationType.NEW_MESSAGE,
      title: "New Message",
      message: `You received a new message from ${message.sender.username}`,
      metadata: { messageId: message.id, jobId: message.jobId },
    });

    res.status(201).json(message);
  }),
);

// Get unread message count for the current user (used by Navbar badge)
router.get("/unread-count", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const count = await prisma.message.count({
      where: {
        receiverId: req.userId!,
        read: false,
      },
    });

    res.json({ count });
  } catch (error) {
    logger.error({ err: error }, "Unread count error");
    res.status(500).json({ error: "Internal server error." });
  }
});

// Get list of conversations for the current user (distinct partners) — used by Socket-based chat UI
router.get("/conversations", authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.userId!;

    const messages = await prisma.message.findMany({
      where: {
        OR: [{ senderId: userId }, { receiverId: userId }],
      },
      include: {
        sender: { select: { id: true, username: true, avatarUrl: true } },
        receiver: { select: { id: true, username: true, avatarUrl: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const conversationMap = new Map<
      string,
      {
        partner: { id: string; username: string; avatarUrl: string | null };
        lastMessage: (typeof messages)[number];
        unreadCount: number;
      }
    >();

    for (const msg of messages) {
      const partner = msg.senderId === userId ? msg.receiver : msg.sender;
      const partnerId = partner.id;

      if (!conversationMap.has(partnerId)) {
        conversationMap.set(partnerId, {
          partner,
          lastMessage: msg,
          unreadCount: 0,
        });
      }

      if (msg.senderId === partnerId && !msg.read) {
        const convo = conversationMap.get(partnerId)!;
        convo.unreadCount += 1;
      }
    }

    const conversations = Array.from(conversationMap.values());
    res.json(conversations);
  } catch (error) {
    logger.error({ err: error }, "Conversations error");
    res.status(500).json({ error: "Internal server error." });
  }
});

// Get conversation list OR conversation history (if jobId and participantId are provided)
router.get("/",
  authenticate,
  validate({ query: getMessagesQuerySchema }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const jobId = req.query.jobId as string | undefined;
    const participantId = req.query.participantId as string | undefined;

    if (participantId) {
      const messages = await prisma.message.findMany({
        where: {
          AND: [
            jobId ? { jobId: jobId as string } : {},
            {
              OR: [
                { senderId: req.userId!, receiverId: participantId as string },
                { senderId: participantId as string, receiverId: req.userId! },
              ],
            },
          ],
        },
        include: {
          sender: { select: { id: true, username: true, avatarUrl: true } },
        },
        orderBy: { createdAt: "asc" },
      });
      res.json(messages);
      return;
    }

    // Fetch all messages involving the user to construct conversation list
    const allMessages = await prisma.message.findMany({
      where: {
        OR: [{ senderId: req.userId! }, { receiverId: req.userId! }],
      },
      include: {
        sender: { select: { id: true, username: true, avatarUrl: true } },
        receiver: { select: { id: true, username: true, avatarUrl: true } },
        job: { select: { id: true, title: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const conversationsMap = new Map();

    allMessages.forEach((msg: any) => {
      const otherUser = msg.senderId === req.userId ? msg.receiver : msg.sender;
      const key = `${otherUser.id}-${msg.jobId || "no-job"}`;

      if (!conversationsMap.has(key)) {
        conversationsMap.set(key, {
          id: key,
          otherUser,
          job: msg.job,
          lastMessage: msg,
          unreadCount: 0,
        });
      }

      if (msg.receiverId === req.userId && !msg.read) {
        conversationsMap.get(key).unreadCount++;
      }
    });

    res.json(Array.from(conversationsMap.values()));
  })
);

// Get total unread message count
router.get(
  "/unread-count",
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const count = await prisma.message.count({
      where: {
        receiverId: req.userId!,
        read: false,
      },
    });
    res.json({ count });
  }),
);

// Get conversation with a specific user (legacy/direct)
router.get(
  "/:id",
  authenticate,
  validate({
    params: getMessageByIdParamSchema,
    query: getMessagesQuerySchema.pick({ jobId: true })
  }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const otherUserId = req.params.id as string;
    const jobId = req.query.jobId as string | undefined;

    const messages = await prisma.message.findMany({
      where: {
        AND: [
          jobId ? { jobId: jobId as string } : {},
          {
            OR: [
              { senderId: req.userId!, receiverId: otherUserId },
              { senderId: otherUserId, receiverId: req.userId! },
            ],
          },
        ],
      },
      include: {
        sender: { select: { id: true, username: true, avatarUrl: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    // Mark messages as read
    await prisma.message.updateMany({
      where: {
        senderId: otherUserId,
        receiverId: req.userId!,
        jobId: jobId ? (jobId as string) : undefined,
        read: false,
      },
      data: { read: true },
    });

    res.json(messages);
  }),
);

// Mark a specific message as read
router.put(
  "/:id/read",
  authenticate,
  validate({
    params: getMessageByIdParamSchema,
    body: markMessageAsReadSchema,
  }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const id = req.params.id as string;
    const { isRead } = req.body;

    await prisma.message.update({
      where: {
        id,
        receiverId: req.userId!,
      },
      data: { read: isRead },
    });
    res.status(204).send();
  }),
);

// Update a message
router.put(
  "/:id",
  authenticate,
  validate({
    params: getMessageByIdParamSchema,
    body: updateMessageSchema,
  }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const id = req.params.id as string;
    const { content } = req.body;

    const message = await prisma.message.findUnique({
      where: { id },
    });

    if (!message) {
      return res.status(404).json({ error: "Message not found." });
    }
    if (message.senderId !== req.userId) {
      return res
        .status(403)
        .json({ error: "Not authorized to update this message." });
    }

    const updated = await prisma.message.update({
      where: { id },
      data: { content },
      include: {
        sender: { select: { id: true, username: true, avatarUrl: true } },
        receiver: { select: { id: true, username: true, avatarUrl: true } },
      },
    });

    res.json(updated);
  }),
);

// Delete a message
router.delete(
  "/:id",
  authenticate,
  validate({ params: getMessageByIdParamSchema }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const id = req.params.id as string;

    const message = await prisma.message.findUnique({
      where: { id },
    });

    if (!message) {
      return res.status(404).json({ error: "Message not found." });
    }
    if (message.senderId !== req.userId) {
      return res
        .status(403)
        .json({ error: "Not authorized to delete this message." });
    }

    await prisma.message.delete({ where: { id } });
    res.json({ message: "Message deleted successfully." });
  }),
);

export default router;
