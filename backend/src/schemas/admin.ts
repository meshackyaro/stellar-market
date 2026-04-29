import { z } from "zod";
import { paginationSchema } from "./common";

export const flagJobSchema = z.object({
  flagReason: z
    .string()
    .min(1, "Flag reason is required")
    .max(500, "Flag reason must be less than 500 characters"),
});

export const suspendUserSchema = z.object({
  suspendReason: z
    .string()
    .min(1, "Suspension reason is required")
    .max(500, "Suspension reason must be less than 500 characters"),
});

export const getUsersAdminQuerySchema = paginationSchema.extend({
  search: z.string().optional(),
  role: z.enum(["CLIENT", "FREELANCER", "ADMIN"]).optional(),
  isSuspended: z
    .string()
    .transform((val) => val === "true")
    .optional(),
  isVerified: z
    .string()
    .transform((val) => val === "true")
    .optional(),
});

export const getJobsAdminQuerySchema = paginationSchema.extend({
  includeDeleted: z
    .string()
    .transform((val) => val === "true")
    .optional(),
});

export const overrideDisputeSchema = z.object({
  outcome: z.string().min(1, "Outcome is required"),
  status: z.enum([
    "RESOLVED_FOR_CLIENT",
    "RESOLVED_FOR_FREELANCER",
    "OVERRIDDEN_BY_ADMIN",
  ]),
});

export const queryPendingDisputesSchema = paginationSchema;

export const queryFlaggedUsersSchema = paginationSchema;

export type FlagJobInput = z.infer<typeof flagJobSchema>;
export type SuspendUserInput = z.infer<typeof suspendUserSchema>;
export type GetUsersAdminQuery = z.infer<typeof getUsersAdminQuerySchema>;
export type GetJobsAdminQuery = z.infer<typeof getJobsAdminQuerySchema>;
export type OverrideDisputeInput = z.infer<typeof overrideDisputeSchema>;
export type QueryPendingDisputes = z.infer<typeof queryPendingDisputesSchema>;
export type QueryFlaggedUsers = z.infer<typeof queryFlaggedUsersSchema>;
