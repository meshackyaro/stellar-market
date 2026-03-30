import { Router, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { authenticate, AuthRequest } from "../middleware/auth";
import { validate } from "../middleware/validation";
import { asyncHandler } from "../middleware/error";
import { NotificationService } from "../services/notification.service";
import { NotificationType } from "@prisma/client";
import { ContractService } from "../services/contract.service";
import {
  createMilestoneSchema,
  updateMilestoneSchema,
  updateMilestoneStatusSchema,
  getMilestonesQuerySchema,
  getMilestoneByIdParamSchema,
  getJobByIdParamSchema,
} from "../schemas";

const router = Router();
const prisma = new PrismaClient();

// Valid status transitions per role
const freelancerTransitions: Record<string, string[]> = {
  PENDING: ["IN_PROGRESS"],
  IN_PROGRESS: ["SUBMITTED"],
};

const clientTransitions: Record<string, string[]> = {
  SUBMITTED: ["APPROVED", "REJECTED"],
};

// List milestones for a job
router.get(
  "/jobs/:jobId/milestones",
  authenticate,
  validate({ params: getJobByIdParamSchema }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const jobId = req.params.jobId as string;

    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (!job) {
      return res.status(404).json({ error: "Job not found." });
    }

    const milestones = await prisma.milestone.findMany({
      where: { jobId },
      orderBy: { createdAt: "asc" },
    });

    res.json(milestones);
  }),
);

// Get all milestones with filtering
router.get(
  "/",
  authenticate,
  validate({ query: getMilestonesQuerySchema }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { page, limit, jobId, status } = req.query as any;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (jobId) where.jobId = jobId;
    if (status) where.status = status;

    const [milestones, total] = await Promise.all([
      prisma.milestone.findMany({
        where,
        include: {
          job: { select: { id: true, title: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.milestone.count({ where }),
    ]);

    res.json({
      data: milestones,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  }),
);

// Create a new milestone
router.post(
  "/",
  authenticate,
  validate({ body: createMilestoneSchema }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { jobId, title, description, amount, dueDate } = req.body;

    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (!job) {
      return res.status(404).json({ error: "Job not found." });
    }
    if (job.clientId !== req.userId) {
      return res
        .status(403)
        .json({ error: "Not authorized to create milestones for this job." });
    }

    const milestonesCount = await prisma.milestone.count({ where: { jobId } });
    const milestone = await prisma.milestone.create({
      data: {
        jobId,
        title,
        description,
        amount,
        dueDate: new Date(dueDate),
        order: milestonesCount + 1,
      },
      include: {
        job: { select: { id: true, title: true } },
      },
    });

    res.status(201).json(milestone);
  }),
);

// Get a single milestone by ID
router.get(
  "/:id",
  authenticate,
  validate({ params: getMilestoneByIdParamSchema }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const id = req.params.id as string;

    const milestone = await prisma.milestone.findUnique({
      where: { id },
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
    });

    if (!milestone) {
      return res.status(404).json({ error: "Milestone not found." });
    }

    // Check if user is authorized to view this milestone
    const isClient = (milestone as any).job.clientId === req.userId;
    const isFreelancer = (milestone as any).job.freelancerId === req.userId;

    if (!isClient && !isFreelancer) {
      return res
        .status(403)
        .json({ error: "Not authorized to view this milestone." });
    }

    res.json(milestone);
  }),
);

// Update a milestone
router.put(
  "/:id",
  authenticate,
  validate({
    params: getMilestoneByIdParamSchema,
    body: updateMilestoneSchema,
  }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const id = req.params.id as string;
    const updateData = req.body;

    if (updateData.dueDate) {
      updateData.dueDate = new Date(updateData.dueDate);
    }

    const milestone = await prisma.milestone.findUnique({
      where: { id },
      include: { job: true },
    });

    if (!milestone) {
      return res.status(404).json({ error: "Milestone not found." });
    }
    if ((milestone as any).job.clientId !== req.userId) {
      return res
        .status(403)
        .json({ error: "Not authorized to update this milestone." });
    }

    const updated = await prisma.milestone.update({
      where: { id },
      data: updateData,
      include: {
        job: { select: { id: true, title: true } },
      },
    });

    res.json(updated);
  }),
);

// Delete a milestone
router.delete(
  "/:id",
  authenticate,
  validate({ params: getMilestoneByIdParamSchema }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const id = req.params.id as string;

    const milestone = await prisma.milestone.findUnique({
      where: { id },
      include: { job: true },
    });

    if (!milestone) {
      return res.status(404).json({ error: "Milestone not found." });
    }
    if ((milestone as any).job.clientId !== req.userId) {
      return res
        .status(403)
        .json({ error: "Not authorized to delete this milestone." });
    }

    await prisma.milestone.delete({ where: { id } });
    res.json({ message: "Milestone deleted successfully." });
  }),
);

// Update milestone status
router.patch(
  "/:id/status",
  authenticate,
  validate({
    params: getMilestoneByIdParamSchema,
    body: updateMilestoneStatusSchema,
  }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const id = req.params.id as string;
    const { status } = req.body;

    const milestone = await prisma.milestone.findUnique({
      where: { id },
      include: { job: true },
    });

    if (!milestone) {
      return res.status(404).json({ error: "Milestone not found." });
    }

    const job = (milestone as any).job;
    const isClient = job.clientId === req.userId;
    const isFreelancer = job.freelancerId === req.userId;

    if (!isClient && !isFreelancer) {
      return res
        .status(403)
        .json({ error: "Not authorized to update this milestone." });
    }

    // Determine allowed transitions based on role
    const currentStatus = milestone.status;
    const allowedStatuses = isFreelancer
      ? (freelancerTransitions[currentStatus] || [])
      : (clientTransitions[currentStatus] || []);

    if (!allowedStatuses.includes(status)) {
      return res.status(403).json({
        error: `Invalid status transition from ${currentStatus} to ${status} for ${isFreelancer ? 'Freelancer' : 'Client'}.`
      });
    }

    const updated = await prisma.milestone.update({
      where: { id },
      data: { status },
    });

    // Notify the client when freelancer submits milestone
    if (isFreelancer && status === "SUBMITTED") {
      await NotificationService.sendNotification({
        userId: job.clientId,
        type: NotificationType.MILESTONE_SUBMITTED,
        title: "Milestone Submitted",
        message: `Freelancer submitted milestone: ${milestone.title}`,
        metadata: { jobId: job.id, milestoneId: id },
      });
    }

    res.json(updated);
  }),
);

// Submit milestone (returns XDR for freelancer signing)
router.put(
  "/milestones/:id/submit",
  authenticate,
  validate({ params: getMilestoneByIdParamSchema }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const id = req.params.id as string;

    const milestone = await prisma.milestone.findUnique({
      where: { id },
      include: { job: { include: { freelancer: true } } },
    });

    if (!milestone || !milestone.job.contractJobId || milestone.onChainIndex === null) {
      return res.status(404).json({ error: "On-chain milestone not found." });
    }

    if (!milestone.job.freelancer || milestone.job.freelancerId !== req.userId) {
      return res
        .status(403)
        .json({ error: "Only the assigned freelancer can submit milestones." });
    }

    if (milestone.status !== "IN_PROGRESS") {
      return res.status(400).json({ error: "Milestone must be in progress to submit." });
    }

    const xdr = await ContractService.buildSubmitMilestoneTx(
      milestone.job.freelancer.walletAddress,
      milestone.job.contractJobId,
      milestone.onChainIndex,
    );

    res.json({ xdr });
  }),
);

// Approve milestone (returns XDR for client signing)
router.put(
  "/milestones/:id/approve",
  authenticate,
  validate({ params: getMilestoneByIdParamSchema }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const id = req.params.id as string;

    const milestone = await prisma.milestone.findUnique({
      where: { id },
      include: { job: { include: { client: true } } },
    });

    if (!milestone || !milestone.job.contractJobId || milestone.onChainIndex === null) {
      return res.status(404).json({ error: "On-chain milestone not found." });
    }

    if (milestone.job.clientId !== req.userId) {
      return res
        .status(403)
        .json({ error: "Only the client can approve milestones." });
    }

    if (milestone.status !== "SUBMITTED") {
      return res.status(400).json({ error: "Milestone must be submitted to approve." });
    }

    const xdr = await ContractService.buildApproveMilestoneTx(
      milestone.job.client.walletAddress,
      milestone.job.contractJobId,
      milestone.onChainIndex,
    );

    res.json({ xdr });
  }),
);

export default router;
