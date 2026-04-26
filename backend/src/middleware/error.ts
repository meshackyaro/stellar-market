import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from "../lib/logger";

export interface ApiError extends Error {
  statusCode?: number;
  details?: any;
}

export const errorHandler = (
  err: ApiError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Default error values
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';
  let details: any = err.details;

  // Handle Zod validation errors
  if (err instanceof ZodError) {
    statusCode = 400;
    message = 'Validation Error';
    details = err.issues.map(error => ({
      field: error.path.join('.'),
      message: error.message,
      code: error.code
    }));
  }

  // Handle Prisma errors
  if (err.name === 'PrismaClientKnownRequestError') {
    statusCode = 400;
    message = 'Database operation failed';
    details = {
      code: (err as any).code,
      target: (err as any).meta?.target,
    };
  }

  // Handle JWT errors
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token';
  }

  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token expired';
  }

  if (err.name === 'MulterError') {
    statusCode = 400;
    const code = (err as any).code;
    if (code === 'LIMIT_FILE_SIZE') {
      message = 'File too large. Avatar must be at most 2MB.';
    } else if (code === 'LIMIT_UNEXPECTED_FILE') {
      message = "Unexpected field. Use 'avatar' for the file.";
    } else {
      message = 'File upload failed.';
    }
  }

  // Log error for debugging
  logger.error(
    {
      err,
      requestId: (req as any).requestId,
      url: req.url,
      method: req.method,
      ip: req.ip,
    },
    "Request error",
  );

  // Send consistent error response
  res.status(statusCode).json({
    error: message,
    requestId: req.requestId,
    ...(details && { details }),
  });
};

export const createError = (message: string, statusCode: number = 500, details?: any): ApiError => {
  const error = new Error(message) as ApiError;
  error.statusCode = statusCode;
  error.details = details;
  return error;
};

export const asyncHandler = (fn: Function) => (req: Request, res: Response, next: NextFunction) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
