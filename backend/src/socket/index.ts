import { Server as HttpServer } from "http";
import { Server as SocketServer, Socket } from "socket.io";
import jwt from "jsonwebtoken";
import { config } from "../config";
import { registerMessageHandlers } from "./messageHandlers";
import { logger } from "../lib/logger";

export interface AuthenticatedSocket extends Socket {
  data: {
    userId: string;
  };
}

let io: SocketServer;

export function initSocket(httpServer: HttpServer): SocketServer {
  io = new SocketServer(httpServer, {
    cors: {
      origin: config.frontendUrl,
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  // JWT auth middleware — runs before every connection
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;

    if (!token) {
      return next(new Error("Authentication error: No token provided."));
    }

    try {
      const decoded = jwt.verify(token, config.jwtSecret) as { userId: string };
      (socket as AuthenticatedSocket).data.userId = decoded.userId;
      next();
    } catch {
      next(new Error("Authentication error: Invalid or expired token."));
    }
  });

  io.on("connection", (socket) => {
    const authedSocket = socket as AuthenticatedSocket;
    const userId = authedSocket.data.userId;
    const joinedRooms = new Set<string>();

    socket.join(`user:${userId}`);
    joinedRooms.add(`user:${userId}`);
    logger.info({ userId, socketId: socket.id }, "Socket connected");

    registerMessageHandlers(io, authedSocket);

    socket.on("disconnect", () => {
      for (const room of joinedRooms) {
        socket.leave(room);
      }
      logger.info({ userId, socketId: socket.id }, "Socket disconnected");
    });
  });

  return io;
}

export function getIo(): SocketServer {
  if (!io) {
    throw new Error("Socket.io not initialized!");
  }
  return io;
}
