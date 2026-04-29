import { randomUUID } from "crypto";
import { NextFunction, Request, Response } from "express";
import { runWithRequestContext } from "../lib/request-context";

export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const incomingRequestId = req.header("X-Request-ID");
  const requestId = incomingRequestId?.trim() || randomUUID();

  req.requestId = requestId;
  res.setHeader("X-Request-ID", requestId);

  runWithRequestContext({ requestId }, () => next());
}
