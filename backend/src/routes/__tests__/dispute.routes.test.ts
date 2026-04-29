import express from "express";
import request from "supertest";
import disputeRoutes from "../dispute.routes";
import { errorHandler } from "../../middleware/error";

describe("Dispute routes auth protection", () => {
  const app = express();
  app.use(express.json());
  app.use("/api/disputes", disputeRoutes);
  app.use(errorHandler);

  it("GET /api/disputes returns 401 when unauthenticated", async () => {
    const response = await request(app).get("/api/disputes");

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: "Access denied. No token provided.",
    });
  });

  it("GET /api/disputes/:id returns 401 when unauthenticated", async () => {
    const response = await request(app).get("/api/disputes/test-dispute-id");

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: "Access denied. No token provided.",
    });
  });
});
