import { Router, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import fs from "fs";
import path from "path";
import { authenticate, AuthRequest } from "../middleware/auth";
import { validate } from "../middleware/validation";
import { upload, UPLOAD_DIR, MAX_FILE_SIZE, AVATAR_UPLOAD_DIR } from "../config/upload";
import { validateFileMimeType, formatFileSize } from "../utils/fileValidation";

const router = Router();
const prisma = new PrismaClient();

// Validation schemas
const uploadSchema = {
  body: z.object({
    jobId: z.string().optional(),
    disputeId: z.string().optional(),
  }),
};

const deleteSchema = {
  params: z.object({
    id: z.string(),
  }),
};

const getFileSchema = {
  params: z.object({
    id: z.string(),
  }),
};

router.get("/avatars/:filename", (req, res) => {
  const filename = req.params.filename as string;
  if (!filename || filename.includes("..")) {
    return res.status(400).json({ error: "Invalid filename" });
  }
  const filePath = path.join(AVATAR_UPLOAD_DIR, filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "Avatar not found" });
  }
  res.setHeader("Content-Type", filename.endsWith(".png") ? "image/png" : "image/jpeg");
  const fileStream = fs.createReadStream(filePath);
  fileStream.pipe(res);
});

/**
 * POST /api/uploads
 * Upload a file and create attachment record
 */
router.post(
  "/",
  authenticate,
  upload.single("file"),
  validate(uploadSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      const { jobId, disputeId } = req.body;

      // Validate that at least one of jobId or disputeId is provided
      if (!jobId && !disputeId) {
        // Clean up uploaded file
        fs.unlinkSync(req.file.path);
        return res.status(400).json({
          error: "Either jobId or disputeId must be provided",
        });
      }

      // Validate file content (MIME sniffing)
      const validation = await validateFileMimeType(req.file.path);
      if (!validation.valid) {
        // Clean up uploaded file
        fs.unlinkSync(req.file.path);
        return res.status(400).json({
          error: validation.error || "Invalid file type",
        });
      }

      // If jobId provided, verify job exists and user has access
      if (jobId) {
        const job = await prisma.job.findUnique({
          where: { id: jobId },
          select: {
            id: true,
            clientId: true,
            freelancerId: true,
          },
        });

        if (!job) {
          fs.unlinkSync(req.file.path);
          return res.status(404).json({ error: "Job not found" });
        }

        // Only job client or freelancer can upload files
        if (job.clientId !== req.userId && job.freelancerId !== req.userId) {
          fs.unlinkSync(req.file.path);
          return res.status(403).json({
            error: "Only job participants can upload files",
          });
        }
      }

      // Create attachment record
      const attachment = await prisma.attachment.create({
        data: {
          uploaderId: req.userId!,
          jobId: jobId || null,
          disputeId: disputeId || null,
          filename: req.file.filename,
          originalName: req.file.originalname,
          mimeType: validation.detectedType || req.file.mimetype,
          size: req.file.size,
          url: `/api/uploads/${req.file.filename}`,
        },
        include: {
          uploader: {
            select: {
              id: true,
              username: true,
              walletAddress: true,
            },
          },
        },
      });

      res.status(201).json({
        ...attachment,
        sizeFormatted: formatFileSize(attachment.size),
      });
    } catch (error: any) {
      // Clean up file if it was uploaded
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }

      // Handle multer errors
      if (error.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({
          error: `File too large. Maximum size is ${formatFileSize(MAX_FILE_SIZE)}`,
        });
      }

      console.error("Error uploading file:", error);
      res.status(500).json({ error: "Failed to upload file" });
    }
  },
);

/**
 * GET /api/uploads/:id
 * Download or view a file
 */
router.get(
  "/:id",
  authenticate,
  validate(getFileSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const attachmentId = req.params.id as string;

      // Check if id is a filename (for backward compatibility)
      let attachment;
      if (attachmentId.includes(".")) {
        // It's a filename
        attachment = await prisma.attachment.findFirst({
          where: { filename: attachmentId },
          include: {
            job: {
              select: {
                id: true,
                clientId: true,
                freelancerId: true,
              },
            },
          },
        });
      } else {
        // It's an ID
        attachment = await prisma.attachment.findUnique({
          where: { id: attachmentId },
          include: {
            job: {
              select: {
                id: true,
                clientId: true,
                freelancerId: true,
              },
            },
          },
        });
      }

      if (!attachment) {
        return res.status(404).json({ error: "File not found" });
      }

      // Access control: job participants can download job / milestone files
      if (attachment.job) {
        const isParticipant =
          attachment.job.clientId === req.userId ||
          attachment.job.freelancerId === req.userId;

        if (!isParticipant && attachment.uploaderId !== req.userId) {
          return res.status(403).json({ error: "Access denied" });
        }
      } else if (attachment.uploaderId !== req.userId) {
        return res.status(403).json({ error: "Access denied" });
      }

      // Check if file exists
      const filePath = path.join(UPLOAD_DIR, attachment.filename);
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: "File not found on server" });
      }

      // Set appropriate headers
      res.setHeader("Content-Type", attachment.mimeType);
      res.setHeader(
        "Content-Disposition",
        `inline; filename="${attachment.originalName}"`,
      );

      // Stream file
      const fileStream = fs.createReadStream(filePath);
      fileStream.pipe(res);
    } catch (error) {
      console.error("Error downloading file:", error);
      res.status(500).json({ error: "Failed to download file" });
    }
  },
);

/**
 * DELETE /api/uploads/:id
 * Delete a file (only uploader can delete)
 */
router.delete(
  "/:id",
  authenticate,
  validate(deleteSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const attachmentId = req.params.id as string;

      const attachment = await prisma.attachment.findUnique({
        where: { id: attachmentId },
      });

      if (!attachment) {
        return res.status(404).json({ error: "File not found" });
      }

      // Only uploader can delete
      if (attachment.uploaderId !== req.userId) {
        return res.status(403).json({
          error: "Only the uploader can delete this file",
        });
      }

      // Delete file from filesystem
      const filePath = path.join(UPLOAD_DIR, attachment.filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }

      // Delete database record
      await prisma.attachment.delete({
        where: { id: attachmentId },
      });

      res.json({ message: "File deleted successfully" });
    } catch (error) {
      console.error("Error deleting file:", error);
      res.status(500).json({ error: "Failed to delete file" });
    }
  },
);

/**
 * GET /api/uploads/job/:jobId
 * Get all attachments for a job
 */
router.get(
  "/job/:jobId",
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const jobId = req.params.jobId as string;

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

      // Get attachments
      const attachments = await prisma.attachment.findMany({
        where: { jobId },
        include: {
          uploader: {
            select: {
              id: true,
              username: true,
              walletAddress: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      res.json({
        attachments: attachments.map((att: any) => ({
          ...att,
          sizeFormatted: formatFileSize(att.size),
        })),
      });
    } catch (error) {
      console.error("Error fetching job attachments:", error);
      res.status(500).json({ error: "Failed to fetch attachments" });
    }
  },
);

export default router;
