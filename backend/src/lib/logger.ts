import pino from "pino";
import { getRequestId } from "./request-context";

export const logger = pino({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === "production" ? "info" : "debug"),
  base: undefined,
  timestamp: pino.stdTimeFunctions.isoTime,
  mixin() {
    const requestId = getRequestId();
    return requestId ? { requestId } : {};
  },
});

/**
 * Backwards-compatible no-op.
 * Previously patched console.* to include requestId; prefer `logger` instead.
 */
export function installRequestIdConsolePatch(): void {
  return;
}
