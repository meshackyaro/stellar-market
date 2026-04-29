import express from "express";
import request from "supertest";
import disputeRoutes from "../dispute.routes";
import { errorHandler } from "../../middleware/error";

jest.mock("../../middleware/auth", () => ({
  authenticate: jest.fn((req, _res, next) => {
    req.userId = "user-1";
    req.userRole = "FREELANCER";
    next();
  }),
}));

jest.mock("../../services/dispute.service", () => ({
  DisputeService: {
    getDisputes: jest.fn(),
    getDisputeById: jest.fn(),
    createDispute: jest.fn(),
    initRaiseDispute: jest.fn(),
    confirmDisputeTransaction: jest.fn(),
    castVote: jest.fn(),
    resolveDispute: jest.fn(),
    getVoteStats: jest.fn(),
    processWebhook: jest.fn(),
  },
}));

const app = express();
app.use(express.json());
app.use("/api/disputes", disputeRoutes);
app.use(errorHandler);

describe("dispute route validation", () => {
  it("rejects invalid init-raise payloads before the handler runs", async () => {
    const response = await request(app)
      .post("/api/disputes/init-raise")
      .send({ jobId: "", reason: "short" });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Validation failed");
  });

  it("rejects invalid webhook payloads before the handler runs", async () => {
    const response = await request(app)
      .post("/api/disputes/webhook")
      .send({ type: "UNKNOWN" });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("Validation failed");
  });
});
