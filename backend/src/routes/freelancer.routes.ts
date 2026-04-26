import { Router, Response, Request } from "express";
import { PrismaClient } from "@prisma/client";
import { asyncHandler } from "../middleware/error";
import { validate } from "../middleware/validation";
import { freelancerSearchQuerySchema, getUserByIdParamSchema } from "../schemas";
import { searchFreelancers } from "../services/freelancer-search.service";

const router = Router();
const prisma = new PrismaClient();

/**
 * GET /api/freelancers/search
 * Public freelancer discovery with optional filters (skills, rating, availability, text).
 */
router.get(
  "/search",
  validate({ query: freelancerSearchQuerySchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const q = req.query as unknown as {
      page: number;
      limit: number;
      minRating?: number;
      available?: boolean;
      q?: string;
      skills?: string[];
    };

    const result = await searchFreelancers(prisma, {
      page: q.page,
      limit: q.limit,
      minRating: q.minRating,
      available: q.available,
      q: q.q,
      skills: q.skills,
    });

    res.json(result);
  })
);

router.get(
  "/:id",
  validate({ params: getUserByIdParamSchema }),
  asyncHandler(async (req: Request, res: Response) => {
    const id = req.params.id as string;

    const freelancer = await prisma.user.findFirst({
      where: { id, role: "FREELANCER" },
      select: {
        id: true,
        username: true,
        avatarUrl: true,
        bio: true,
        role: true,
        skills: true,
        availability: true,
        averageRating: true,
        reviewCount: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!freelancer) {
      return res.status(404).json({ error: "Freelancer not found." });
    }

    const lastModified = freelancer.updatedAt ?? freelancer.createdAt;
    const etag = `W/"freelancer:${id}:${lastModified.toISOString()}"`;
    res.setHeader("ETag", etag);
    res.setHeader("Last-Modified", lastModified.toUTCString());
    if (req.headers["if-none-match"] === etag) {
      return res.status(304).end();
    }

    res.json(freelancer);
  }),
);

export default router;
