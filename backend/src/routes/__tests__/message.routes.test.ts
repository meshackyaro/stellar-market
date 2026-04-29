import request from "supertest";
import express from "express";
import jwt from "jsonwebtoken";
import { config } from "../../config";
import messageRouter from "../message.routes";

// ─── Prisma & NotificationService mocks ───────────────────────────────────────
jest.mock("@prisma/client", () => {
  const mockPrisma = {
    message: {
      create: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
      count: jest.fn(),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({
        id: "00000000-0000-4000-8000-000000000001",
        role: "FREELANCER",
        emailVerified: true,
      }),
    },
    notification: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      updateMany: jest.fn(),
    },
  };
  return {
    PrismaClient: jest.fn(() => mockPrisma) as any,
    UserRole: {
      CLIENT: "CLIENT",
      FREELANCER: "FREELANCER",
      ADMIN: "ADMIN",
    } as any,
    NotificationType: {
      NEW_MESSAGE: "NEW_MESSAGE",
      JOB_APPLIED: "JOB_APPLIED",
      APPLICATION_ACCEPTED: "APPLICATION_ACCEPTED",
      MILESTONE_SUBMITTED: "MILESTONE_SUBMITTED",
      MILESTONE_APPROVED: "MILESTONE_APPROVED",
      DISPUTE_RAISED: "DISPUTE_RAISED",
      DISPUTE_RESOLVED: "DISPUTE_RESOLVED",
    } as any,
  };
});

// Suppress TS errors for the mock to avoid compilation issues in tests
// @ts-ignore
import { UserRole, NotificationType } from "@prisma/client";

jest.mock("../../services/notification.service", () => ({
  NotificationService: {
    sendNotification: jest.fn().mockResolvedValue({ id: "mock-notif-id" }),
  },
}));

import { PrismaClient } from "@prisma/client";
const prismaMock = new PrismaClient() as any;
const messageMock = prismaMock.message;
const userMock = prismaMock.user;

// ─── App setup ────────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());
app.use("/api/messages", messageRouter);

// ─── Stable test UUIDs (RFC 4122 v4 format) ──────────────────────────────────
const USER_TEST_ID = "00000000-0000-4000-8000-000000000001";
const USER_OTHER_ID = "00000000-0000-4000-8000-000000000002";

// ─── Helper: auth header ──────────────────────────────────────────────────────
function authHeader(userId = USER_TEST_ID) {
  const token = jwt.sign({ userId }, config.jwtSecret, { expiresIn: "1h" });
  return { Authorization: `Bearer ${token}` };
}

afterEach(() => jest.clearAllMocks());

beforeEach(() => {
  // Ensure authenticate finds a user record by default
  userMock.findUnique.mockResolvedValue({
    id: USER_TEST_ID,
    role: "FREELANCER",
    emailVerified: true,
  });
});

// ─── POST /api/messages ───────────────────────────────────────────────────────
describe("POST /api/messages", () => {
  const mockCreated = {
    id: "00000000-0000-4000-8000-000000000010",
    senderId: USER_TEST_ID,
    receiverId: USER_OTHER_ID,
    content: "Hi!",
    read: false,
    jobId: null,
    createdAt: new Date().toISOString(),
    sender: { id: USER_TEST_ID, username: "alice", avatarUrl: null },
    receiver: { id: USER_OTHER_ID, username: "bob", avatarUrl: null },
  };

  it("creates a message and returns 201", async () => {
    messageMock.create.mockResolvedValueOnce(mockCreated);

    const res = await request(app)
      .post("/api/messages")
      .set(authHeader())
      .send({ receiverId: USER_OTHER_ID, content: "Hi!" });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ content: "Hi!" });
    expect(messageMock.create).toHaveBeenCalledTimes(1);
  });

  it("returns 400 when receiverId is missing", async () => {
    const res = await request(app)
      .post("/api/messages")
      .set(authHeader())
      .send({ content: "Hi!" }); // missing receiverId

    expect(res.status).toBe(400);
    expect(messageMock.create).not.toHaveBeenCalled();
  });

  it("returns 400 when content is missing", async () => {
    const res = await request(app)
      .post("/api/messages")
      .set(authHeader())
      .send({ receiverId: USER_OTHER_ID }); // missing content

    expect(res.status).toBe(400);
  });

  it("returns 401 with no auth token", async () => {
    const res = await request(app)
      .post("/api/messages")
      .send({ receiverId: USER_OTHER_ID, content: "Hi!" });

    expect(res.status).toBe(401);
  });
});

// ─── GET /api/messages/unread-count ──────────────────────────────────────────
describe("GET /api/messages/unread-count", () => {
  it("returns the unread count for the authenticated user", async () => {
    messageMock.count.mockResolvedValueOnce(5);

    const res = await request(app)
      .get("/api/messages/unread-count")
      .set(authHeader());

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ count: 5 });
    expect(messageMock.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          receiverId: USER_TEST_ID,
          read: false,
        }),
      }),
    );
  });

  it("returns 401 with no auth token", async () => {
    const res = await request(app).get("/api/messages/unread-count");
    expect(res.status).toBe(401);
  });
});

// ─── GET /api/messages/conversations ─────────────────────────────────────────
describe("GET /api/messages/conversations", () => {
  it("returns a list of conversations", async () => {
    const USER_BOB_ID = "00000000-0000-4000-8000-000000000003";
    const now = new Date().toISOString();
    messageMock.findMany.mockResolvedValueOnce([
      {
        id: "00000000-0000-4000-8000-000000000010",
        senderId: USER_TEST_ID,
        receiverId: USER_BOB_ID,
        content: "Hey!",
        read: true,
        createdAt: now,
        sender: { id: USER_TEST_ID, username: "alice", avatarUrl: null },
        receiver: { id: USER_BOB_ID, username: "bob", avatarUrl: null },
      },
    ]);

    const res = await request(app)
      .get("/api/messages/conversations")
      .set(authHeader());

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0]).toMatchObject({
      partner: { username: "bob" },
    });
  });

  it("returns 401 with no auth token", async () => {
    const res = await request(app).get("/api/messages/conversations");
    expect(res.status).toBe(401);
  });
});

// ─── GET /api/messages/:userId ────────────────────────────────────────────────
describe("GET /api/messages/:userId", () => {
  it("returns conversation history and marks messages as read", async () => {
    const mockMessages = [
      {
        id: "00000000-0000-4000-8000-000000000010",
        senderId: USER_OTHER_ID,
        receiverId: USER_TEST_ID,
        content: "Hello",
        read: false,
        createdAt: new Date().toISOString(),
        sender: { id: USER_OTHER_ID, username: "bob", avatarUrl: null },
      },
    ];
    messageMock.findMany.mockResolvedValueOnce(mockMessages);
    messageMock.updateMany.mockResolvedValueOnce({ count: 1 });

    const res = await request(app)
      .get(`/api/messages/${USER_OTHER_ID}`)
      .set(authHeader());

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(messageMock.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          senderId: USER_OTHER_ID,
          receiverId: USER_TEST_ID,
          read: false,
        }),
        data: { read: true },
      }),
    );
  });

  it("returns 401 with no auth token", async () => {
    const res = await request(app).get(`/api/messages/${USER_OTHER_ID}`);
    expect(res.status).toBe(401);
  });
});
