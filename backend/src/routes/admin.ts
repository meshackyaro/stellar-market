import { Router, Response } from "express";
import { PrismaClient, UserRole, DisputeStatus } from "@prisma/client";
import { AuthRequest, requireAdmin } from "../middleware/auth";
import {
    flagJobSchema,
    suspendUserSchema,
    getUsersAdminQuerySchema,
    overrideDisputeSchema
} from "../schemas/admin";
import { ZodError, z } from "zod";
import { logAdminAction } from "../utils/auditLogger";
import { NotificationService } from "../services/notification.service";

const router = Router();
const prisma = new PrismaClient();

// Apply requireAdmin middleware to all admin routes
router.use(requireAdmin);

/**
 * GET /api/admin/users
 * List all users with filters (search, role, isSuspended, isVerified)
 */
router.get("/users", async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const query = getUsersAdminQuerySchema.parse(req.query);
        const { page = 1, limit = 10, search, role, isSuspended, isVerified } = query;
        const skip = (page - 1) * limit;

        const where: any = {};

        if (search) {
            where.OR = [
                { username: { contains: search, mode: "insensitive" } },
                { email: { contains: search, mode: "insensitive" } },
                { walletAddress: { contains: search, mode: "insensitive" } },
            ];
        }

        if (role) where.role = role;
        if (isSuspended !== undefined) where.isSuspended = isSuspended;
        if (isVerified !== undefined) where.emailVerified = isVerified;

        const [users, total] = await Promise.all([
            prisma.user.findMany({
                where,
                skip,
                take: limit,
                select: {
                    id: true,
                    username: true,
                    email: true,
                    walletAddress: true,
                    role: true,
                    isSuspended: true,
                    emailVerified: true,
                    createdAt: true,
                },
                orderBy: { createdAt: "desc" },
            }),
            prisma.user.count({ where }),
        ]);

        res.json({
            users,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        if (error instanceof ZodError) {
            res.status(400).json({ error: "Validation error", details: error.issues });
            return;
        }
        console.error("Error fetching users:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

/**
 * PATCH /api/admin/users/:id/suspend
 * Suspend/unsuspend a user
 */
router.patch("/users/:id/suspend", async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const id = req.params.id as string;
        const { suspendReason, isSuspended } = z.object({
            suspendReason: z.string().optional(),
            isSuspended: z.boolean(),
        }).parse(req.body);

        const user = await prisma.user.findUnique({ where: { id } });
        if (!user) {
            res.status(404).json({ error: "User not found" });
            return;
        }

        const updatedUser = await prisma.user.update({
            where: { id },
            data: {
                isSuspended,
                suspendReason: isSuspended ? suspendReason : null,
                suspendedAt: isSuspended ? new Date() : null,
            },
        });

        await logAdminAction(
            req.userId!,
            isSuspended ? "SUSPEND_USER" : "UNSUSPEND_USER",
            id,
            { reason: suspendReason }
        );

        res.json({
            message: `User ${isSuspended ? "suspended" : "restored"} successfully`,
            user: {
                id: updatedUser.id,
                username: updatedUser.username,
                isSuspended: updatedUser.isSuspended,
            },
        });
    } catch (error) {
        if (error instanceof ZodError) {
            res.status(400).json({ error: "Validation error", details: error.issues });
            return;
        }
        res.status(500).json({ error: "Internal server error" });
    }
});

/**
 * DELETE /api/admin/jobs/:id
 * Remove a fraudulent job listing
 */
router.delete("/jobs/:id", async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const id = req.params.id as string;

        const job = await prisma.job.findUnique({ where: { id } });
        if (!job) {
            res.status(404).json({ error: "Job not found" });
            return;
        }

        await prisma.job.delete({ where: { id } });

        // Notify uploader
        if (job.clientId) {
            await NotificationService.sendNotification({
                userId: job.clientId,
                type: "CANCELLED" as any,
                title: "Job Removed by Moderator",
                message: `Your job listing "${job.title}" has been removed by a platform administrator for violating terms.`,
            });
        }

        await logAdminAction(req.userId!, "DELETE_JOB", id, { title: job.title });

        res.json({ message: "Job removed successfully" });
    } catch (error) {
        console.error("Error removing job:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

/**
 * GET /api/admin/disputes
 * List all disputes with escalation status
 */
router.get("/disputes", async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const disputes = await prisma.dispute.findMany({
            include: {
                job: {
                    select: {
                        id: true,
                        title: true,
                        clientId: true,
                        freelancerId: true,
                    },
                },
            },
            orderBy: { createdAt: "desc" },
        });

        res.json({ disputes });
    } catch (error) {
        console.error("Error fetching disputes:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

/**
 * PATCH /api/admin/disputes/:id/override
 * Override dispute outcome
 */
router.patch("/disputes/:id/override", async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const id = req.params.id as string;
        const { outcome, status } = overrideDisputeSchema.parse(req.body);

        const dispute = await prisma.dispute.findUnique({ where: { id } });
        if (!dispute) {
            res.status(404).json({ error: "Dispute not found" });
            return;
        }

        const updatedDispute = await prisma.dispute.update({
            where: { id },
            data: {
                outcome,
                status: status as DisputeStatus,
                resolvedAt: new Date(),
            },
        });

        await logAdminAction(req.userId!, "OVERRIDE_DISPUTE", id, {
            outcome,
            status
        });

        res.json({
            message: "Dispute outcome overridden successfully",
            dispute: updatedDispute,
        });
    } catch (error) {
        if (error instanceof ZodError) {
            res.status(400).json({ error: "Validation error", details: error.issues });
            return;
        }
        res.status(500).json({ error: "Internal server error" });
    }
});

/**
 * GET /api/admin/audit-log
 * Paginated log of all admin actions
 */
router.get("/audit-log", async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 20;
        const skip = (page - 1) * limit;

        const [logs, total] = await Promise.all([
            prisma.auditLog.findMany({
                skip,
                take: limit,
                include: {
                    admin: {
                        select: {
                            id: true,
                            username: true,
                        },
                    },
                },
                orderBy: { timestamp: "desc" },
            }),
            prisma.auditLog.count(),
        ]);

        res.json({
            logs,
            pagination: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
            },
        });
    } catch (error) {
        res.status(500).json({ error: "Internal server error" });
    }
});

/**
 * GET /api/admin/flagged
 * List all flagged jobs and suspended users (Upstream merge)
 */
router.get("/flagged", async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const [flaggedJobs, suspendedUsers] = await Promise.all([
            prisma.job.findMany({
                where: { isFlagged: true },
                include: {
                    client: {
                        select: { id: true, username: true, walletAddress: true },
                    },
                },
                orderBy: { flaggedAt: "desc" },
            }),
            prisma.user.findMany({
                where: { isSuspended: true },
                select: { id: true, username: true, walletAddress: true, suspendReason: true, suspendedAt: true },
                orderBy: { suspendedAt: "desc" },
            }),
        ]);

        res.json({
            flaggedJobs: flaggedJobs.map((job) => ({
                id: job.id,
                title: job.title,
                client: job.client,
                flagReason: job.flagReason,
                flaggedAt: job.flaggedAt,
            })),
            suspendedUsers: suspendedUsers,
        });
    } catch (error) {
        console.error("Error fetching flagged content:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

/**
 * GET /api/admin/stats
 * Get moderation statistics (Upstream merge)
 */
router.get("/stats", async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const [totalJobs, flaggedJobs, totalUsers, suspendedUsers] = await Promise.all([
            prisma.job.count(),
            prisma.job.count({ where: { isFlagged: true } }),
            prisma.user.count(),
            prisma.user.count({ where: { isSuspended: true } }),
        ]);

        res.json({
            totalJobs,
            flaggedJobs,
            totalUsers,
            suspendedUsers,
        });
    } catch (error) {
        console.error("Error fetching stats:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

/**
 * POST /api/admin/jobs/:id/flag
 * Flag a job with reason
 */
router.post("/jobs/:id/flag", async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const id = req.params.id as string;
        const validatedData = flagJobSchema.parse(req.body);

        const job = await prisma.job.findUnique({ where: { id } });
        if (!job) {
            res.status(404).json({ error: "Job not found" });
            return;
        }

        const updatedJob = await prisma.job.update({
            where: { id },
            data: {
                isFlagged: true,
                flagReason: validatedData.flagReason,
                flaggedAt: new Date(),
                flaggedBy: req.userId,
            },
        });

        await logAdminAction(req.userId!, "FLAG_JOB", id, { reason: validatedData.flagReason });

        res.json({ message: "Job flagged successfully", job: updatedJob });
    } catch (error) {
        if (error instanceof ZodError) {
            res.status(400).json({ error: "Validation error", details: error.issues });
            return;
        }
        res.status(500).json({ error: "Internal server error" });
    }
});

/**
 * POST /api/admin/jobs/:id/dismiss
 * Remove flag from job (Upstream merge)
 */
router.post("/jobs/:id/dismiss", async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const id = req.params.id as string;

        const job = await prisma.job.findUnique({ where: { id } });
        if (!job) {
            res.status(404).json({ error: "Job not found" });
            return;
        }

        const updatedJob = await prisma.job.update({
            where: { id },
            data: {
                isFlagged: false,
                flagReason: null,
                flaggedAt: null,
                flaggedBy: null,
            },
        });

        await logAdminAction(req.userId!, "DISMISS_JOB_FLAG", id);

        res.json({ message: "Job flag dismissed successfully", job: updatedJob });
    } catch (error) {
        res.status(500).json({ error: "Internal server error" });
    }
});

/**
 * POST /api/admin/jobs/:id/remove
 * Legacy mapping for job removal
 */
router.post("/jobs/:id/remove", async (req: AuthRequest, res: Response): Promise<void> => {
    const id = req.params.id as string;
    const job = await prisma.job.findUnique({ where: { id } });
    if (!job) {
        res.status(404).json({ error: "Job not found" });
        return;
    }
    await prisma.job.delete({ where: { id } });
    await logAdminAction(req.userId!, "DELETE_JOB", id, { title: job.title });
    res.json({ message: "Job removed successfully" });
});

/**
 * POST /api/admin/users/:id/suspend
 * Legacy mapping for user suspension
 */
router.post("/users/:id/suspend", async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const id = req.params.id as string;
        const validatedData = suspendUserSchema.parse(req.body);

        const updatedUser = await prisma.user.update({
            where: { id },
            data: {
                isSuspended: true,
                suspendReason: validatedData.suspendReason,
                suspendedAt: new Date(),
            },
        });

        await logAdminAction(req.userId!, "SUSPEND_USER", id, { reason: validatedData.suspendReason });

        res.json({ message: "User suspended successfully", user: updatedUser });
    } catch (error) {
        res.status(500).json({ error: "Internal server error" });
    }
});

/**
 * POST /api/admin/users/:id/restore
 * Legacy mapping for user restoration (Upstream merge)
 */
router.post("/users/:id/restore", async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const id = req.params.id as string;

        const user = await prisma.user.findUnique({ where: { id } });
        if (!user) {
            res.status(404).json({ error: "User not found" });
            return;
        }

        const updatedUser = await prisma.user.update({
            where: { id },
            data: {
                isSuspended: false,
                suspendReason: null,
                suspendedAt: null,
            },
        });

        await logAdminAction(req.userId!, "UNSUSPEND_USER", id);

        res.json({ message: "User restored successfully", user: updatedUser });
    } catch (error) {
        res.status(500).json({ error: "Internal server error" });
    }
});

const REPORT_STATUSES = ["PENDING", "REVIEWED", "DISMISSED"] as const;

/**
 * GET /api/admin/reports
 * List all reports, filterable by status and targetType.
 */
router.get("/reports", async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const page = Math.max(1, parseInt(req.query.page as string) || 1);
        const limit = Math.min(100, parseInt(req.query.limit as string) || 20);
        const skip = (page - 1) * limit;

        const where: any = {};
        if (req.query.status) where.status = req.query.status;
        if (req.query.targetType) where.targetType = req.query.targetType;

        const [reports, total] = await Promise.all([
            (prisma as any).report.findMany({
                where,
                skip,
                take: limit,
                orderBy: { createdAt: "desc" },
                include: {
                    reporter: { select: { id: true, username: true } },
                },
            }),
            (prisma as any).report.count({ where }),
        ]);

        res.json({
            reports,
            pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
        });
    } catch (error) {
        console.error("Error fetching reports:", error);
        res.status(500).json({ error: "Internal server error" });
    }
});

/**
 * PATCH /api/admin/reports/:id
 * Update report status; optionally suspend the target user.
 */
router.patch("/reports/:id", async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const id = req.params.id as string;
        const { status, suspend, suspendReason } = z.object({
            status: z.enum(REPORT_STATUSES),
            suspend: z.boolean().optional(),
            suspendReason: z.string().optional(),
        }).parse(req.body);

        const report = await (prisma as any).report.findUnique({ where: { id } });
        if (!report) {
            res.status(404).json({ error: "Report not found" });
            return;
        }

        const updated = await (prisma as any).report.update({
            where: { id },
            data: { status },
        });

        if (suspend && report.targetType === "USER") {
            await (prisma.user as any).update({
                where: { id: report.targetId },
                data: {
                    isSuspended: true,
                    suspendReason: suspendReason ?? `Suspended via report ${id}`,
                    suspendedAt: new Date(),
                },
            });
            await logAdminAction(req.userId!, "SUSPEND_USER_VIA_REPORT", report.targetId, { reportId: id });
        }

        await logAdminAction(req.userId!, "UPDATE_REPORT", id, { status });

        res.json({ report: updated });
    } catch (error) {
        if (error instanceof ZodError) {
            res.status(400).json({ error: "Validation error", details: error.issues });
            return;
        }
        res.status(500).json({ error: "Internal server error" });
    }
});

export default router;
