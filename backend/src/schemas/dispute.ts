import { z } from "zod";

export const createDisputeSchema = z.object({
  jobId: z.string().cuid({ message: "Invalid job ID format" }),
  reason: z
    .string()
    .min(10, { message: "Reason must be at least 10 characters long" })
    .max(2000, { message: "Reason must not exceed 2000 characters" }),
});

export const castVoteSchema = z.object({
  choice: z.enum(["CLIENT", "FREELANCER"], { 
    message: "Choice must be either CLIENT or FREELANCER" 
  }),
  reason: z.string().min(10, { message: "Please provide a reason for your vote" }),
});

export const queryDisputesSchema = z.object({
  status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED"]).optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

export const resolveDisputeSchema = z.object({
  outcome: z.string().min(10, { message: "Outcome description must be at least 10 characters long" }),
});

export const webhookPayloadSchema = z.object({
  type: z.enum(["DISPUTE_RAISED", "VOTE_CAST", "DISPUTE_RESOLVED"]),
  disputeId: z.string(),
  onChainDisputeId: z.string().optional(),
  jobId: z.string().optional(),
  voterId: z.string().optional(),
  choice: z.enum(["CLIENT", "FREELANCER"]).optional(),
  outcome: z.string().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});
