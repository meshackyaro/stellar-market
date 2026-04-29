import { Request, Response, NextFunction } from "express";
import { authenticate, AuthRequest } from "../auth";
import jwt from "jsonwebtoken";
import { config } from "../../config";

// Mock PrismaClient
jest.mock("@prisma/client", () => {
  const mockPrisma = {
    user: {
      findUnique: jest.fn(),
    },
  };
  return {
    PrismaClient: jest.fn(() => mockPrisma),
  };
});

// Import after mocking
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

describe("Email Verification Enforcement", () => {
  let req: Partial<AuthRequest>;
  let res: Partial<Response>;
  let next: NextFunction;

  beforeEach(() => {
    req = {
      headers: {},
    } as Partial<AuthRequest>;
    Object.defineProperty(req, "path", {
      writable: true,
      configurable: true,
      value: "/api/users/me",
    });
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    next = jest.fn();
    jest.clearAllMocks();
  });

  it("should block unverified users from protected routes", async () => {
    const token = jwt.sign({ userId: "user123" }, config.jwtSecret);
    req.headers = { authorization: `Bearer ${token}` };

    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      role: "FREELANCER",
      emailVerified: false,
    });

    await authenticate(req as AuthRequest, res as Response, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      error: "Email not verified.",
      message:
        "Please check your inbox and click the verification link before continuing.",
      code: "EMAIL_NOT_VERIFIED",
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("should allow verified users to access protected routes", async () => {
    const token = jwt.sign({ userId: "user123" }, config.jwtSecret);
    req.headers = { authorization: `Bearer ${token}` };

    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      role: "FREELANCER",
      emailVerified: true,
    });

    await authenticate(req as AuthRequest, res as Response, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("should allow unverified users to access exempt routes", async () => {
    const token = jwt.sign({ userId: "user123" }, config.jwtSecret);
    req.headers = { authorization: `Bearer ${token}` };
    Object.defineProperty(req, "path", {
      writable: true,
      configurable: true,
      value: "/api/auth/send-verification",
    });

    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      role: "FREELANCER",
      emailVerified: false,
    });

    await authenticate(req as AuthRequest, res as Response, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("should allow unverified users to verify their email", async () => {
    const token = jwt.sign({ userId: "user123" }, config.jwtSecret);
    req.headers = { authorization: `Bearer ${token}` };
    Object.defineProperty(req, "path", {
      writable: true,
      configurable: true,
      value: "/api/auth/verify-email/sometoken",
    });

    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      role: "FREELANCER",
      emailVerified: false,
    });

    await authenticate(req as AuthRequest, res as Response, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("should allow unverified users to login", async () => {
    const token = jwt.sign({ userId: "user123" }, config.jwtSecret);
    req.headers = { authorization: `Bearer ${token}` };
    Object.defineProperty(req, "path", {
      writable: true,
      configurable: true,
      value: "/api/auth/login",
    });

    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      role: "FREELANCER",
      emailVerified: false,
    });

    await authenticate(req as AuthRequest, res as Response, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});

