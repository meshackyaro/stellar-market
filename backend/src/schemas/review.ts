import { z } from "zod";
import { paginationSchema, reviewRatingSchema } from "./common";

export const createReviewSchema = z.object({
  jobId: z.string().min(1, "Job ID is required"),
  revieweeId: z.string().min(1, "Reviewee ID is required"),
  rating: reviewRatingSchema,
  comment: z
    .string()
    .min(10, "Comment must be at least 10 characters long")
    .max(1000, "Comment must be less than 1000 characters"),
});

export const updateReviewSchema = z.object({
  rating: reviewRatingSchema.optional(),
  comment: z
    .string()
    .min(10, "Comment must be at least 10 characters long")
    .max(1000, "Comment must be less than 1000 characters")
    .optional(),
});

export const getReviewsQuerySchema = paginationSchema.extend({
  jobId: z.string().min(1).optional(),
  reviewerId: z.string().min(1).optional(),
  revieweeId: z.string().min(1).optional(),
  rating: z.coerce.number().int().min(1).max(5).optional(),
});

export const getReviewByIdParamSchema = z.object({
  id: z.string().min(1, "ID is required"),
});

export const getReviewsByUserParamSchema = z.object({
  userId: z.string().min(1, "User ID is required"),
});
