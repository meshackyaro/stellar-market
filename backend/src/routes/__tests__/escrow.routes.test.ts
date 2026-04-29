import express from "express";
import jwt from "jsonwebtoken";
import request from "supertest";
import { config } from "../../config";
import escrowRouter from "../escrow.routes";

jest.mock("@prisma/client", () => {
  const mockPrisma = {
    job: {
      findUnique: jest.fn(),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({
        id: "00000000-0000-4000-8000-000000000001",
        role: "CLIENT",
        emailVerified: true,
      }),
    },
  };

  return {
    PrismaClient: jest.fn(() => mockPrisma) as any,
    EscrowStatus: {
      UNFUNDED: "UNFUNDED",
      FUNDED: "FUNDED",
      COMPLETED: "COMPLETED",
    } as any,
    NotificationType: {
      MILESTONE_APPROVED: "MILESTONE_APPROVED",
    } as any,
  };
});

jest.mock("../../services/contract.service", () => ({
  ContractService: {
    buildCreateJobTx: jest.fn(),
    buildFundJobTx: jest.fn(),
    buildApproveMilestoneTx: jest.fn(),
    verifyTransaction: jest.fn(),
  },
}));

jest.mock("../../services/notification.service", () => ({
  NotificationService: {
    sendNotification: jest.fn(),
  },
}));

import { PrismaClient } from "@prisma/client";
import { ContractService } from "../../services/contract.service";

const prismaMock = new PrismaClient() as any;
const jobMock = prismaMock.job;
const buildCreateJobTxMock = ContractService.buildCreateJobTx as jest.Mock;

const app = express();
app.use(express.json());
app.use("/api/escrow", escrowRouter);

const CLIENT_ID = "00000000-0000-4000-8000-000000000001";
const JOB_ID = "00000000-0000-4000-8000-000000000100";

function authHeader(userId = CLIENT_ID) {
  const token = jwt.sign({ userId }, config.jwtSecret, { expiresIn: "1h" });
  return { Authorization: `Bearer ${token}` };
}

afterEach(() => jest.clearAllMocks());

describe("POST /api/escrow/init-create", () => {
  it("returns 400 when the job deadline is missing", async () => {
    jobMock.findUnique.mockResolvedValueOnce({
      id: JOB_ID,
      clientId: CLIENT_ID,
      deadline: null,
      client: { walletAddress: "GCLIENT" },
      freelancer: { walletAddress: "GFREELANCER" },
      milestones: [
        {
          title: "Milestone 1",
          amount: 100,
          contractDeadline: new Date("2026-04-01T00:00:00.000Z"),
          order: 0,
        },
      ],
    });

    const res = await request(app)
      .post("/api/escrow/init-create")
      .set(authHeader())
      .send({ jobId: JOB_ID });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: "Job must have a deadline before initializing escrow.",
    });
    expect(buildCreateJobTxMock).not.toHaveBeenCalled();
  });

  it("returns 400 when the job has no milestones", async () => {
    jobMock.findUnique.mockResolvedValueOnce({
      id: JOB_ID,
      clientId: CLIENT_ID,
      deadline: new Date("2026-04-10T00:00:00.000Z"),
      client: { walletAddress: "GCLIENT" },
      freelancer: { walletAddress: "GFREELANCER" },
      milestones: [],
    });

    const res = await request(app)
      .post("/api/escrow/init-create")
      .set(authHeader())
      .send({ jobId: JOB_ID });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: "Job must have at least one milestone before initializing escrow.",
    });
    expect(buildCreateJobTxMock).not.toHaveBeenCalled();
  });
});
