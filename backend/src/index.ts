import express from "express";
import cors from "cors";
import helmet from "helmet";
import { createServer } from "http";
import { config } from "./config";
import routes from "./routes";
import {
  globalRateLimiter,
  authRateLimiter,
  forgotPasswordRateLimiter,
  writeRateLimiter,
} from "./middleware/rate-limit";
import { sanitizeInput } from "./middleware/sanitize";
import { errorHandler } from "./middleware/error";
import { initSocket } from "./socket";
import { startExpiryJob } from "./jobs/expiry.job";

const app = express();
import { swaggerUi, swaggerSpec } from "./config/swagger";
const httpServer = createServer(app);

// Attach Socket.io
initSocket(httpServer);

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    if (!origin || origin === config.frontendUrl) {
      callback(null, true);
      return;
    }

    callback(new Error("Not allowed by CORS"));
  },
};

// Security middleware
// Swagger UI setup (disabled in production)
if (process.env.NODE_ENV !== "production") {
  app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  app.get("/api/openapi.json", (_req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.send(swaggerSpec);
  });
}
app.use(helmet());
app.use(cors(corsOptions));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(sanitizeInput);

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "stellarmarket-api" });
});

// Rate limiting
app.use("/api/auth", authRateLimiter);
app.use("/api/auth/forgot-password", forgotPasswordRateLimiter);

// Write rate limiting (applied before routes for POST mutations)
app.use("/api/jobs", writeRateLimiter);
app.use("/api/reviews", writeRateLimiter);
app.use("/api/disputes", writeRateLimiter);

// Global rate limiting (skip auth routes already limited)
app.use("/api", globalRateLimiter);

// API routes
app.use("/api", routes);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: "Route not found." });
});

// Error handler
app.use(errorHandler);

httpServer.listen(config.port, () => {
  console.log(`StellarMarket API running on port ${config.port}`);
  startExpiryJob();
});

// Graceful shutdown
process.on("SIGTERM", async () => {
  console.log("SIGTERM received, shutting down gracefully...");

  // Flush any pending notification batches
  const { NotificationService } =
    await import("./services/notification.service");
  await NotificationService.flushAllBatches();

  httpServer.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
});

process.on("SIGINT", async () => {
  console.log("SIGINT received, shutting down gracefully...");

  // Flush any pending notification batches
  const { NotificationService } =
    await import("./services/notification.service");
  await NotificationService.flushAllBatches();

  httpServer.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
});

export { app, httpServer };
