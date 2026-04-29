import express from "express";
import request from "supertest";
import adminRoutes from "../admin";
import { errorHandler } from "../../middleware/error";

jest.mock("@prisma/client", () => ({
  PrismaClient: jest.fn(() => ({
    user: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    job: {
      findUnique: jest.fn(),
      delete: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    dispute: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    auditLog: {
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
    },
  })),
  UserRole: {
    ADMIN: "ADMIN",
    CLIENT: "CLIENT",
    FREELANCER: "FREELANCER",
  },
  DisputeStatus: {
    RESOLVED_FOR_CLIENT: "RESOLVED_FOR_CLIENT",
    RESOLVED_FOR_FREELANCER: "RESOLVED_FOR_FREELANCER",
    OVERRIDDEN_BY_ADMIN: "OVERRIDDEN_BY_ADMIN",
  },
}));

jest.mock("../../middleware/auth", () => ({
  requireAdmin: jest.fn((req, _res, next) => {
    req.userId = "admin-1";
    req.userRole = "ADMIN";
    next();
  }),
}));

jest.mock("../../services/notification.service", () => ({
  NotificationService: {
    sendNotification: jest.fn().mockResolvedValue({ id: "notif-1" }),
  },
}));

const app = express();
app.use(express.json());
app.use("/api/admin", adminRoutes);
app.use(errorHandler);

describe("admin route validation", () => {
  it("rejects invalid users query params before hitting the handler", async () => {
    const response = await request(app).get("/api/admin/users?role=INVALID");

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Validation failed");
  });

  it("rejects invalid suspend payloads before hitting the handler", async () => {
    const response = await request(app)
      .patch("/api/admin/users/user-1/suspend")
      .send({ isSuspended: "yes" });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Validation failed");
  });
});
