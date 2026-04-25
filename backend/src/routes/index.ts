import { Router } from "express";
import authRoutes from "./auth.routes";
import userRoutes from "./user.routes";
import jobRoutes from "./job.routes";
import applicationRoutes from "./application.routes";
import messageRoutes from "./message.routes";
import reviewRoutes from "./review.routes";
import notificationRoutes from "./notification.routes";
import milestoneRoutes from "./milestone.routes";
import escrowRoutes from "./escrow.routes";
import transactionRoutes from "./transaction.routes";
import uploadRoutes from "./upload.routes";
import adminRoutes from "./admin";
import disputeRoutes from "./dispute.routes";
import recommendationRoutes from "./recommendation.routes";
import freelancerRoutes from "./freelancer.routes";
import platformRoutes from "./platform.routes";

const router = Router();

router.use("/auth", authRoutes);
router.use("/users", userRoutes);
router.use("/notifications", notificationRoutes);
router.use("/jobs/recommended", recommendationRoutes);
router.use("/jobs", jobRoutes);
router.use("/", applicationRoutes);
router.use("/", milestoneRoutes);
router.use("/messages", messageRoutes);
router.use("/reviews", reviewRoutes);
router.use("/escrow", escrowRoutes);
router.use("/transactions", transactionRoutes);
router.use("/uploads", uploadRoutes);
router.use("/admin", adminRoutes);
router.use("/disputes", disputeRoutes);
router.use("/freelancers", freelancerRoutes);
router.use("/platform", platformRoutes);

export default router;
