import { Router, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { authenticate, AuthRequest } from "../middleware/auth";
import { validate } from "../middleware/validation";
import { asyncHandler } from "../middleware/error";
import {
  createJobSchema,
  updateJobSchema,
  getJobsQuerySchema,
  getJobByIdParamSchema,
  updateJobStatusSchema,
  getSavedJobsQuerySchema,
} from "../schemas";
import {
  cache,
  invalidateCache,
  invalidateCacheKey,
  generateJobsCacheKey,
  generateJobCacheKey,
  generateJobOnChainStatusCacheKey,
} from "../lib/cache";
import {
  ContractService,
  RevisionProposalView,
} from "../services/contract.service";

const router = Router();
/**
 * @swagger
 * tags:
 *   name: Jobs
 *   description: Job management endpoints
 */
const prisma = new PrismaClient();

// Get all jobs with optional filters and pagination
router.get(
  "/",
  /**
   * @swagger
   * /jobs:
   *   get:
   *     summary: Get all jobs
   *     tags: [Jobs]
   *     parameters:
   *       - in: query
   *         name: page
   *         schema:
   *           type: integer
   *         description: Page number
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *         description: Items per page
   *     responses:
   *       200:
   *         description: List of jobs
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/JobsResponse'
   */
  /**
   * @swagger
   * /jobs/{id}:
   *   get:
   *     summary: Get job by ID
   *     tags: [Jobs]
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: Job ID
   *     responses:
   *       200:
   *         description: Job details
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/JobResponse'
   *       404:
   *         description: Job not found
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ErrorResponse'
   */
  validate({ query: getJobsQuerySchema }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const {
      page,
      limit,
      search,
      skill,
      skills,
      status,
      minBudget,
      maxBudget,
      clientId,
      sort,
      postedAfter,
    } = req.query as any;

    // Generate cache key based on query parameters
    const cacheKey = generateJobsCacheKey({
      page,
      limit,
      search,
      skill,
      skills,
      status,
      minBudget,
      maxBudget,
      clientId,
      sort,
      postedAfter,
    });

    // Cache for 60 seconds
    const { data, hit } = await cache(cacheKey, 60, async () => {
      const skip = (page - 1) * limit;

      const where: any = {};

      if (search) {
        where.OR = [
          { title: { contains: search, mode: "insensitive" } },
          { description: { contains: search, mode: "insensitive" } },
        ];
      }

      if (skills) {
        const skillList = (skills as string)
          .split(",")
          .map((s: string) => s.trim());
        where.skills = { hasSome: skillList };
      } else if (skill) {
        where.skills = { has: skill };
      }

      if (status) {
        const statusList = (status as string)
          .split(",")
          .map((s: string) => s.trim());
        if (statusList.length === 1) {
          where.status = statusList[0];
        } else {
          where.status = { in: statusList };
        }
      }

      if (minBudget || maxBudget) {
        where.budget = {};
        if (minBudget) where.budget.gte = minBudget;
        if (maxBudget) where.budget.lte = maxBudget;
      }

      if (clientId) {
        where.clientId = clientId;
      }

      if (postedAfter) {
        where.createdAt = { gte: new Date(postedAfter) };
      }

      let orderBy: any = { createdAt: "desc" };
      if (sort === "oldest") orderBy = { createdAt: "asc" };
      else if (sort === "budget_high") orderBy = { budget: "desc" };
      else if (sort === "budget_low") orderBy = { budget: "asc" };

      const [jobs, total] = await Promise.all([
        prisma.job.findMany({
          where,
          include: {
            client: { select: { id: true, username: true, avatarUrl: true } },
            freelancer: {
              select: { id: true, username: true, avatarUrl: true },
            },
            milestones: true,
            _count: { select: { applications: true } },
          },
          orderBy,
          skip,
          take: limit,
        }),
        prisma.job.count({ where }),
      ]);

      return {
        data: jobs,
        total,
        page,
        totalPages: Math.ceil(total / limit),
      };
    });

    // Add cache hit status to response headers for debugging
    res.set("X-Cache-Hit", hit.toString());
    res.json(data);
  }),
);

// Get jobs for the authenticated user (client or freelancer)
router.get(
  "/mine",
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { page = 1, limit = 10, status } = req.query as any;
    const skip = (Number(page) - 1) * Number(limit);

    const where: any = {
      OR: [{ clientId: req.userId }, { freelancerId: req.userId }],
    };
    if (status) where.status = status;

    const [jobs, total] = await Promise.all([
      prisma.job.findMany({
        where,
        skip,
        take: Number(limit),
        orderBy: { createdAt: "desc" },
        include: {
          client: { select: { id: true, username: true, avatarUrl: true } },
          freelancer: { select: { id: true, username: true, avatarUrl: true } },
          milestones: true,
          _count: { select: { applications: true } },
        },
      }),
      prisma.job.count({ where }),
    ]);

    res.json({
      data: jobs,
      total,
      page: Number(page),
      totalPages: Math.ceil(total / Number(limit)),
    });
  }),
);

// Get saved jobs for authenticated freelancer
router.get(
  "/saved",
  authenticate,
  validate({ query: getSavedJobsQuerySchema }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { role: true },
    });

    if (!user || user.role !== "FREELANCER") {
      return res
        .status(403)
        .json({ error: "Only freelancers can view saved jobs." });
    }

    const {
      page = 1,
      limit = 10,
      search,
      skill,
      minBudget,
      maxBudget,
    } = req.query as any;
    const skip = (Number(page) - 1) * Number(limit);

    // Build job filter conditions
    const jobWhere: any = {
      status: "OPEN",
    };

    if (search) {
      jobWhere.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
      ];
    }

    if (skill) {
      jobWhere.skills = { has: skill };
    }

    if (minBudget || maxBudget) {
      jobWhere.budget = {};
      if (minBudget) jobWhere.budget.gte = Number(minBudget);
      if (maxBudget) jobWhere.budget.lte = Number(maxBudget);
    }

    // Build SavedJob where clause with job filters
    const savedJobWhere: any = {
      freelancerId: req.userId,
      job: jobWhere,
    };

    const [savedJobs, total] = await Promise.all([
      prisma.savedJob.findMany({
        where: savedJobWhere,
        include: {
          job: {
            include: {
              client: { select: { id: true, username: true, avatarUrl: true } },
              milestones: true,
              _count: { select: { applications: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: Number(limit),
      }),
      prisma.savedJob.count({
        where: savedJobWhere,
      }),
    ]);

    const jobs = savedJobs.map((savedJob) => ({
      ...savedJob.job,
      savedAt: savedJob.createdAt,
      isSaved: true,
    }));

    res.json({
      data: jobs,
      total,
      page: Number(page),
      totalPages: Math.ceil(total / Number(limit)),
    });
  }),
);

// Get a single job by ID
router.get(
  "/:id",
  validate({ params: getJobByIdParamSchema }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const id = req.params.id as string;
    const job = await prisma.job.findUnique({
      where: { id },
      include: {
        client: {
          select: { id: true, username: true, avatarUrl: true, bio: true },
        },
        freelancer: {
          select: { id: true, username: true, avatarUrl: true, bio: true },
        },
        milestones: { orderBy: { order: "asc" } },
        applications: {
          include: {
            freelancer: {
              select: { id: true, username: true, avatarUrl: true },
            },
          },
        },
      },
    });

    if (!job) {
      return res.status(404).json({ error: "Job not found." });
    }

    // Check if job is saved by authenticated user (if freelancer)
    let isSaved = false;
    if (req.userId) {
      const user = await prisma.user.findUnique({
        where: { id: req.userId },
        select: { role: true },
      });

      if (user && user.role === "FREELANCER") {
        const savedJob = await prisma.savedJob.findUnique({
          where: {
            freelancerId_jobId: {
              freelancerId: req.userId,
              jobId: id,
            },
          },
        });
        isSaved = !!savedJob;
      }
    }

    // Fetch on-chain escrow status if contractJobId is present
    let escrowStatus = job.escrowStatus as string;
    let revisionProposal: RevisionProposalView | null = null;

    if (job.contractJobId) {
      try {
        const cacheKey = generateJobOnChainStatusCacheKey(id);
        const { data: onChainStatus } = await cache(cacheKey, 30, async () => {
          return await ContractService.getOnChainJobStatus(job.contractJobId!);
        });
        escrowStatus = onChainStatus;
      } catch (error) {
        console.warn(
          `Could not fetch on-chain status for job ${id}, falling back to DB:`,
          error,
        );
      }

      try {
        const p = await ContractService.getRevisionProposal(job.contractJobId);
        revisionProposal = p && p.status === "PENDING" ? p : null;
      } catch (error) {
        console.warn(`Could not fetch revision proposal for job ${id}:`, error);
      }
    }

    res.json({
      ...job,
      escrow_status: escrowStatus, // Alias for frontend compatibility
      escrowStatus: escrowStatus, // Keep original for consistency
      revisionProposal,
      isSaved,
    });
  }),
);

// Create a new job
router.post(
  "/",
  /**
   * @swagger
   * /jobs:
   *   post:
   *     summary: Create a new job
   *     tags: [Jobs]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/CreateJobRequest'
   *           examples:
   *             example:
   *               value:
   *                 title: Sample Job
   *                 description: Job description...
   *                 budget: 1000
   *                 skills: ["React", "Node.js"]
   *                 deadline: "2026-03-01T00:00:00Z"
   *                 category: Development
   *     responses:
   *       201:
   *         description: Job created
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/JobResponse'
   *       400:
   *         description: Invalid input
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ErrorResponse'
   */
  /**
   * @swagger
   * /jobs/{id}:
   *   put:
   *     summary: Update a job
   *     tags: [Jobs]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: Job ID
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             $ref: '#/components/schemas/UpdateJobRequest'
   *     responses:
   *       200:
   *         description: Job updated
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/JobResponse'
   *       403:
   *         description: Not authorized
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ErrorResponse'
   *       404:
   *         description: Job not found
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ErrorResponse'
   */
  /**
   * @swagger
   * /jobs/{id}:
   *   delete:
   *     summary: Delete a job
   *     tags: [Jobs]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *         description: Job ID
   *     responses:
   *       200:
   *         description: Job deleted
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/SuccessResponse'
   *       403:
   *         description: Not authorized
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ErrorResponse'
   *       404:
   *         description: Job not found
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/ErrorResponsenponse'
   */
  authenticate,
  validate({ body: createJobSchema }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { role: true },
    });

    if (!user || user.role !== "CLIENT") {
      return res.status(403).json({ error: "Only clients can post jobs." });
    }

    const { title, description, budget, skills, deadline } = req.body;

    const job = await prisma.job.create({
      data: {
        title,
        description,
        budget,
        category: req.body.category || "General",
        skills,
        deadline: new Date(deadline),
        clientId: req.userId!,
      },
      include: { milestones: true },
    });

    // Invalidate job listings cache when a new job is created
    await invalidateCache("jobs:list:*");

    res.status(201).json(job);
  }),
);

// Update a job
router.put(
  "/:id",
  authenticate,
  validate({
    params: getJobByIdParamSchema,
    body: updateJobSchema,
  }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const id = req.params.id as string;
    const job = await prisma.job.findUnique({ where: { id } });

    if (!job) {
      return res.status(404).json({ error: "Job not found." });
    }
    if (job.clientId !== req.userId) {
      return res
        .status(403)
        .json({ error: "Not authorized to update this job." });
    }

    const updateData = req.body;
    if (updateData.deadline) {
      updateData.deadline = new Date(updateData.deadline);
    }

    const updated = await prisma.job.update({
      where: { id },
      data: updateData,
      include: { milestones: true },
    });

    // Invalidate job listings cache and single job cache
    await invalidateCache("jobs:list:*");
    await invalidateCacheKey(generateJobCacheKey(id));

    res.json(updated);
  }),
);

// Delete a job
router.delete(
  "/:id",
  authenticate,
  validate({ params: getJobByIdParamSchema }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const id = req.params.id as string;
    const job = await prisma.job.findUnique({ where: { id } });

    if (!job) {
      return res.status(404).json({ error: "Job not found." });
    }
    if (job.clientId !== req.userId) {
      return res
        .status(403)
        .json({ error: "Not authorized to delete this job." });
    }

    await prisma.job.delete({ where: { id } });

    // Invalidate job listings cache and single job cache
    await invalidateCache("jobs:list:*");
    await invalidateCacheKey(generateJobCacheKey(id));

    res.json({ message: "Job deleted successfully." });
  }),
);

// Update job status
router.patch(
  "/:id/status",
  authenticate,
  validate({
    params: getJobByIdParamSchema,
    body: updateJobStatusSchema,
  }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const id = req.params.id as string;
    const { status } = req.body;

    const job = await prisma.job.findUnique({ where: { id } });

    if (!job) {
      return res.status(404).json({ error: "Job not found." });
    }
    if (job.clientId !== req.userId) {
      return res
        .status(403)
        .json({ error: "Not authorized to update this job." });
    }

    const updated = await prisma.job.update({
      where: { id },
      data: { status },
      include: { milestones: true },
    });

    // Invalidate job listings cache and single job cache
    await invalidateCache("jobs:list:*");
    await invalidateCacheKey(generateJobCacheKey(id));

    res.json(updated);
  }),
);

// Complete a job (client only)
router.patch(
  "/:id/complete",
  authenticate,
  validate({ params: getJobByIdParamSchema }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const id = req.params.id as string;

    const job = await prisma.job.findUnique({
      where: { id },
      include: { milestones: true, freelancer: true },
    });

    if (!job) {
      return res.status(404).json({ error: "Job not found." });
    }
    if (job.clientId !== req.userId) {
      return res
        .status(403)
        .json({ error: "Only the client can mark the job as complete." });
    }

    // Validate all milestones are approved
    const allApproved = job.milestones.every((m) => m.status === "APPROVED");
    if (!allApproved) {
      return res.status(400).json({
        error: "All milestones must be approved before completing the job.",
      });
    }

    // Update job status to COMPLETED
    const updated = await prisma.job.update({
      where: { id },
      data: { status: "COMPLETED" },
      include: { milestones: true, client: true, freelancer: true },
    });

    // Send notifications to both parties
    const { NotificationService } =
      await import("../services/notification.service");

    // Notify freelancer
    if (job.freelancerId) {
      await NotificationService.sendNotification({
        userId: job.freelancerId,
        type: "MILESTONE_APPROVED",
        title: "Job Completed",
        message: `The client has marked "${job.title}" as complete. Please leave a review!`,
        metadata: { jobId: id },
      });
    }

    // Emit Socket.IO event
    const { getIo } = await import("../socket");
    const io = getIo();
    io.to(`user:${job.clientId}`).emit("job:completed", { jobId: id });
    if (job.freelancerId) {
      io.to(`user:${job.freelancerId}`).emit("job:completed", { jobId: id });
    }

    // Invalidate caches
    await invalidateCache("jobs:list:*");
    await invalidateCacheKey(generateJobCacheKey(id));

    res.json(updated);
  }),
);

// Save/bookmark a job
router.post(
  "/:id/save",
  authenticate,
  validate({ params: getJobByIdParamSchema }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { role: true },
    });

    if (!user || user.role !== "FREELANCER") {
      return res.status(403).json({ error: "Only freelancers can save jobs." });
    }

    const id = req.params.id as string;
    const job = await prisma.job.findUnique({ where: { id } });

    if (!job) {
      return res.status(404).json({ error: "Job not found." });
    }

    // Check if already saved
    const existingSave = await prisma.savedJob.findUnique({
      where: {
        freelancerId_jobId: {
          freelancerId: req.userId!,
          jobId: id,
        },
      },
    });

    if (existingSave) {
      return res.status(409).json({ error: "Job already saved." });
    }

    const savedJob = await prisma.savedJob.create({
      data: {
        freelancerId: req.userId!,
        jobId: id,
      },
    });

    res.status(201).json({
      message: "Job saved successfully.",
      savedJob,
    });
  }),
);

// Remove saved/bookmarked job
router.delete(
  "/:id/save",
  authenticate,
  validate({ params: getJobByIdParamSchema }),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { role: true },
    });

    if (!user || user.role !== "FREELANCER") {
      return res
        .status(403)
        .json({ error: "Only freelancers can unsave jobs." });
    }

    const id = req.params.id as string;

    const savedJob = await prisma.savedJob.findUnique({
      where: {
        freelancerId_jobId: {
          freelancerId: req.userId!,
          jobId: id,
        },
      },
    });

    if (!savedJob) {
      return res.status(404).json({ error: "Job was not saved." });
    }

    await prisma.savedJob.delete({
      where: {
        freelancerId_jobId: {
          freelancerId: req.userId!,
          jobId: id,
        },
      },
    });

    res.json({ message: "Job unsaved successfully." });
  }),
);

export default router;
