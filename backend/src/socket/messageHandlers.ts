import { Server as SocketServer } from "socket.io";
import { PrismaClient } from "@prisma/client";
import { AuthenticatedSocket } from "./index";
import { logger } from "../lib/logger";

const prisma = new PrismaClient();

export function registerMessageHandlers(
  io: SocketServer,
  socket: AuthenticatedSocket
): void {
  const senderId = socket.data.userId;

  // ─── send_message ────────────────────────────────────────────────────────────
  socket.on(
    "send_message",
    async (payload: { receiverId: string; content: string; jobId?: string }) => {
      const { receiverId, content, jobId } = payload;

      if (!receiverId || !content) {
        socket.emit("error", { message: "receiverId and content are required." });
        return;
      }

      try {
        const message = await prisma.message.create({
          data: {
            senderId,
            receiverId,
            jobId: jobId ?? null,
            content,
          },
          include: {
            sender: { select: { id: true, username: true, avatarUrl: true } },
            receiver: { select: { id: true, username: true, avatarUrl: true } },
          },
        });

        // Emit to receiver's personal room
        io.to(`user:${receiverId}`).emit("new_message", message);
        // Also emit back to sender (so other sender tabs update instantly)
        socket.emit("new_message", message);
      } catch (err) {
        logger.error({ err, senderId, receiverId }, "send_message error");
        socket.emit("error", { message: "Failed to send message." });
      }
    }
  );

  // ─── mark_read ───────────────────────────────────────────────────────────────
  socket.on("mark_read", async (payload: { senderId: string }) => {
    const { senderId: originalSenderId } = payload;

    if (!originalSenderId) {
      socket.emit("error", { message: "senderId is required." });
      return;
    }

    try {
      await prisma.message.updateMany({
        where: {
          senderId: originalSenderId,
          receiverId: senderId,
          read: false,
        },
        data: { read: true },
      });

      // Notify the original sender that their messages were read
      io.to(`user:${originalSenderId}`).emit("messages_read", {
        byUserId: senderId,
      });
    } catch (err) {
      logger.error({ err, senderId, originalSenderId }, "mark_read error");
      socket.emit("error", { message: "Failed to mark messages as read." });
    }
  });

  // ─── typing_start ────────────────────────────────────────────────────────────
  socket.on("typing_start", (payload: { receiverId: string }) => {
    const { receiverId } = payload;
    if (!receiverId) return;

    io.to(`user:${receiverId}`).emit("user_typing", { userId: senderId });
  });

  // ─── typing_stop ─────────────────────────────────────────────────────────────
  socket.on("typing_stop", (payload: { receiverId: string }) => {
    const { receiverId } = payload;
    if (!receiverId) return;

    io.to(`user:${receiverId}`).emit("user_stopped_typing", { userId: senderId });
  });
}
