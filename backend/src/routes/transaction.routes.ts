import { Router, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import { authenticate, AuthRequest } from "../middleware/auth";
import { validate } from "../middleware/validation";

const router = Router();
const prisma = new PrismaClient();

// Validation schemas
const createTransactionSchema = {
  body: z.object({
    jobId: z.string(),
    milestoneId: z.string().optional(),
    fromAddress: z.string(),
    toAddress: z.string(),
    amount: z.number().positive(),
    tokenAddress: z.string(),
    txHash: z.string(),
    type: z.enum(["DEPOSIT", "RELEASE", "REFUND", "DISPUTE_PAYOUT"]),
  }),
};

const listTransactionsSchema = {
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    type: z.enum(["DEPOSIT", "RELEASE", "REFUND", "DISPUTE_PAYOUT"]).optional(),
    dateFrom: z.string().optional(),
    dateTo: z.string().optional(),
    minAmount: z.coerce.number().optional(),
    maxAmount: z.coerce.number().optional(),
  }),
};

const jobTransactionsSchema = {
  params: z.object({
    jobId: z.string(),
  }),
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  }),
};

const txHashSchema = {
  params: z.object({
    txHash: z.string(),
  }),
};

/**
 * POST /api/transactions
 * Record a transaction after successful on-chain tx
 */
router.post(
  "/",
  authenticate,
  validate(createTransactionSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const {
        jobId,
        milestoneId,
        fromAddress,
        toAddress,
        amount,
        tokenAddress,
        txHash,
        type,
      } = req.body;

      // Verify job exists
      const job = await prisma.job.findUnique({
        where: { id: jobId },
      });

      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      // Verify milestone exists if provided
      if (milestoneId) {
        const milestone = await prisma.milestone.findUnique({
          where: { id: milestoneId },
        });

        if (!milestone || milestone.jobId !== jobId) {
          return res
            .status(404)
            .json({ error: "Milestone not found or does not belong to job" });
        }
      }

      // Check if transaction already exists
      const existingTx = await prisma.transaction.findUnique({
        where: { txHash },
      });

      if (existingTx) {
        return res.status(409).json({ error: "Transaction already recorded" });
      }

      // Create transaction
      const transaction = await prisma.transaction.create({
        data: {
          jobId,
          milestoneId,
          fromAddress,
          toAddress,
          amount,
          tokenAddress,
          txHash,
          type,
        },
        include: {
          job: {
            select: {
              id: true,
              title: true,
            },
          },
          milestone: {
            select: {
              id: true,
              title: true,
            },
          },
        },
      });

      res.status(201).json(transaction);
    } catch (error) {
      console.error("Error creating transaction:", error);
      res.status(500).json({ error: "Failed to create transaction" });
    }
  },
);

/**
 * GET /api/transactions
 * List transactions for authenticated user (paginated and filtered)
 */
router.get(
  "/",
  authenticate,
  validate(listTransactionsSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.userId },
      });

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const {
        page = 1,
        limit = 20,
        type,
        dateFrom,
        dateTo,
        minAmount,
        maxAmount,
      } = req.query;

      const skip = (page - 1) * limit;

      // Build filter
      const where: any = {
        OR: [
          { fromAddress: user.walletAddress },
          { toAddress: user.walletAddress },
        ],
      };

      if (type) {
        where.type = type;
      }

      if (dateFrom || dateTo) {
        where.createdAt = {};
        if (dateFrom) {
          where.createdAt.gte = new Date(dateFrom as string);
        }
        if (dateTo) {
          where.createdAt.lte = new Date(dateTo as string);
        }
      }

      if (minAmount || maxAmount) {
        where.amount = {};
        if (minAmount) {
          where.amount.gte = minAmount;
        }
        if (maxAmount) {
          where.amount.lte = maxAmount;
        }
      }

      // Get transactions
      const [transactions, total] = await Promise.all([
        prisma.transaction.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: "desc" },
          include: {
            job: {
              select: {
                id: true,
                title: true,
              },
            },
            milestone: {
              select: {
                id: true,
                title: true,
              },
            },
          },
        }),
        prisma.transaction.count({ where }),
      ]);

      res.json({
        transactions,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      console.error("Error fetching transactions:", error);
      res.status(500).json({ error: "Failed to fetch transactions" });
    }
  },
);

/**
 * GET /api/transactions/summary/stats
 * Get total earnings and spent for authenticated user
 */
router.get(
  "/summary/stats",
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.userId },
      });

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Get total earned (money received)
      const earned = await prisma.transaction.aggregate({
        where: {
          toAddress: user.walletAddress,
        },
        _sum: {
          amount: true,
        },
      });

      // Get total spent (money sent)
      const spent = await prisma.transaction.aggregate({
        where: {
          fromAddress: user.walletAddress,
        },
        _sum: {
          amount: true,
        },
      });

      // Get transaction counts by type
      const transactionsByType = await prisma.transaction.groupBy({
        by: ["type"],
        where: {
          OR: [
            { fromAddress: user.walletAddress },
            { toAddress: user.walletAddress },
          ],
        },
        _count: {
          type: true,
        },
      });

      // Get recent transactions
      const recentTransactions = await prisma.transaction.findMany({
        where: {
          OR: [
            { fromAddress: user.walletAddress },
            { toAddress: user.walletAddress },
          ],
        },
        take: 5,
        orderBy: { createdAt: "desc" },
        include: {
          job: {
            select: {
              id: true,
              title: true,
            },
          },
        },
      });

      res.json({
        totalEarned: earned._sum.amount || 0,
        totalSpent: spent._sum.amount || 0,
        netBalance: (earned._sum.amount || 0) - (spent._sum.amount || 0),
        transactionsByType: transactionsByType.reduce(
          (
            acc: Record<string, number>,
            item: { type: string; _count: { type: number } },
          ) => {
            acc[item.type] = item._count.type;
            return acc;
          },
          {} as Record<string, number>,
        ),
        recentTransactions,
      });
    } catch (error) {
      console.error("Error fetching transaction summary:", error);
      res.status(500).json({ error: "Failed to fetch transaction summary" });
    }
  },
);

/**
 * GET /api/transactions/job/:jobId
 * Get all transactions for a specific job
 */
router.get(
  "/job/:jobId",
  authenticate,
  validate(jobTransactionsSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const jobId = req.params.jobId as string;
      const { page = 1, limit = 20 } = req.query as any;

      const skip = (page - 1) * limit;

      // Verify job exists and user has access
      const job = await prisma.job.findUnique({
        where: { id: jobId },
        select: {
          id: true,
          clientId: true,
          freelancerId: true,
        },
      });

      if (!job) {
        return res.status(404).json({ error: "Job not found" });
      }

      if (job.clientId !== req.userId && job.freelancerId !== req.userId) {
        return res.status(403).json({ error: "Access denied" });
      }

      // Get transactions
      const [transactions, total] = await Promise.all([
        prisma.transaction.findMany({
          where: { jobId },
          skip,
          take: limit,
          orderBy: { createdAt: "asc" },
          include: {
            milestone: {
              select: {
                id: true,
                title: true,
                order: true,
              },
            },
          },
        }),
        prisma.transaction.count({ where: { jobId } }),
      ]);

      res.json({
        transactions,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      console.error("Error fetching job transactions:", error);
      res.status(500).json({ error: "Failed to fetch job transactions" });
    }
  },
);

/**
 * GET /api/transactions/:txHash
 * Lookup transaction by Stellar tx hash
 */
router.get(
  "/:txHash",
  authenticate,
  validate(txHashSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const txHash = req.params.txHash as string;

      const transaction = await prisma.transaction.findUnique({
        where: { txHash },
        include: {
          job: {
            select: {
              id: true,
              title: true,
              clientId: true,
              freelancerId: true,
            },
          },
          milestone: {
            select: {
              id: true,
              title: true,
              order: true,
            },
          },
        },
      });

      if (!transaction) {
        return res.status(404).json({ error: "Transaction not found" });
      }

      const user = await prisma.user.findUnique({
        where: { id: req.userId },
      });

      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Verify user has access to this transaction
      if (
        transaction.fromAddress !== user.walletAddress &&
        transaction.toAddress !== user.walletAddress &&
        transaction.job.clientId !== req.userId &&
        transaction.job.freelancerId !== req.userId
      ) {
        return res.status(403).json({ error: "Access denied" });
      }

      res.json(transaction);
    } catch (error) {
      console.error("Error fetching transaction:", error);
      res.status(500).json({ error: "Failed to fetch transaction" });
    }
  },
);

export default router;
