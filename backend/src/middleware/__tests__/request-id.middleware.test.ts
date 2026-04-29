import express from "express";
import request from "supertest";
import { requestIdMiddleware } from "../request-id";

describe("requestIdMiddleware", () => {
  const app = express();
  app.use(requestIdMiddleware);
  app.get("/ping", (req, res) => {
    res.json({ requestId: req.requestId });
  });

  it("reuses the incoming X-Request-ID header", async () => {
    const response = await request(app)
      .get("/ping")
      .set("X-Request-ID", "wave-request-123");

    expect(response.status).toBe(200);
    expect(response.headers["x-request-id"]).toBe("wave-request-123");
    expect(response.body.requestId).toBe("wave-request-123");
  });

  it("generates a request ID when the header is missing", async () => {
    const response = await request(app).get("/ping");

    expect(response.status).toBe(200);
    expect(response.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/i);
    expect(response.body.requestId).toBe(response.headers["x-request-id"]);
  });
});
