import { Request, Response } from "express";
import rateLimit from "express-rate-limit";
import RedisStore from "rate-limit-redis";
import RedisClient from "../lib/redis";

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const WRITE_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

type RateLimitedRequest = Request & { userId?: string; rateLimit?: { resetTime?: Date } };

const sendTooManyRequests = (req: RateLimitedRequest, res: Response): void => {
  const resetTime = req.rateLimit?.resetTime;
  const retryAfterSeconds = resetTime
    ? Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 1000))
    : Math.ceil(RATE_LIMIT_WINDOW_MS / 1000);

  res.setHeader("Retry-After", retryAfterSeconds.toString());
  res.status(429).json({ error: "Too many requests" });
};

const sendTooManyWrites = (req: RateLimitedRequest, res: Response): void => {
  const resetTime = req.rateLimit?.resetTime;
  const retryAfterSeconds = resetTime
    ? Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 1000))
    : Math.ceil(WRITE_RATE_LIMIT_WINDOW_MS / 1000);

  res.setHeader("Retry-After", retryAfterSeconds.toString());
  res.status(429).json({ error: "Too many write requests" });
};

export const globalRateLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({
    prefix: "rl:global:",
    sendCommand: (...args: string[]) => RedisClient.getInstance().call(...args),
  }),
  passOnStoreError: true,
  handler: sendTooManyRequests,
});

export const loginRateLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({
    prefix: "rl:auth:login:",
    sendCommand: (...args: string[]) => RedisClient.getInstance().call(...args),
  }),
  passOnStoreError: true,
  handler: sendTooManyRequests,
});

export const registerRateLimiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({
    prefix: "rl:auth:register:",
    sendCommand: (...args: string[]) => RedisClient.getInstance().call(...args),
  }),
  passOnStoreError: true,
  handler: sendTooManyRequests,
});

export const forgotPasswordRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({
    prefix: "rl:auth:forgot-password:",
    sendCommand: (...args: string[]) => RedisClient.getInstance().call(...args),
  }),
  passOnStoreError: true,
  handler: sendTooManyRequests,
});

export const writeRateLimiter = rateLimit({
  windowMs: WRITE_RATE_LIMIT_WINDOW_MS,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({
    prefix: "rl:write:",
    sendCommand: (...args: string[]) => RedisClient.getInstance().call(...args),
  }),
  passOnStoreError: true,
  keyGenerator: (req) => {
    const rateLimitedReq = req as RateLimitedRequest;
    return rateLimitedReq.userId || req.ip || "unknown";
  },
  skip: (req) => req.method !== "POST",
  handler: sendTooManyWrites,
});
