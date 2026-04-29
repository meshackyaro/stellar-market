import { PrismaClient } from "@prisma/client";
import { 
  cache,
  generateRecommendationsCacheKey,
  invalidateCache
} from "../lib/cache";

const prisma = new PrismaClient();

/** Weight configuration for scoring components */
const WEIGHTS = {
  SKILL_OVERLAP: 0.5,
  CATEGORY_AFFINITY: 0.25,
  RECENCY: 0.15,
  REPUTATION: 0.1,
};

/** Max age in days for recency scoring — jobs older than this get 0 recency score */
const RECENCY_WINDOW_DAYS = 30;

/**
 * Computes Jaccard similarity between two string arrays.
 * J(A, B) = |A ∩ B| / |A ∪ B|
 * Returns 0 when both sets are empty.
 */
export function jaccardSimilarity(a: string[], b: string[]): number {
  const setA = new Set(a.map((s) => s.toLowerCase()));
  const setB = new Set(b.map((s) => s.toLowerCase()));

  if (setA.size === 0 && setB.size === 0) return 0;

  let intersectionSize = 0;
  for (const item of setA) {
    if (setB.has(item)) intersectionSize++;
  }

  const unionSize = new Set([...setA, ...setB]).size;
  return intersectionSize / unionSize;
}

/**
 * Computes category affinity score.
 * Returns 1 if the job's category is in the freelancer's completed categories, 0 otherwise.
 */
export function categoryAffinityScore(
  jobCategory: string,
  completedCategories: string[]
): number {
  const normalizedJob = jobCategory.toLowerCase();
  return completedCategories.some((c) => c.toLowerCase() === normalizedJob)
    ? 1
    : 0;
}

/**
 * Computes recency score based on how recently a job was posted.
 * Returns a value between 0 and 1. Jobs posted today score 1,
 * jobs older than RECENCY_WINDOW_DAYS score 0.
 */
export function recencyScore(createdAt: Date, now: Date = new Date()): number {
  const ageMs = now.getTime() - createdAt.getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  if (ageDays >= RECENCY_WINDOW_DAYS) return 0;
  return 1 - ageDays / RECENCY_WINDOW_DAYS;
}

/**
 * Computes reputation score for a client.
 * Normalizes the average rating to a 0–1 scale (rating / 5).
 * Returns 0 if no reviews exist.
 */
export function reputationScore(averageRating: number): number {
  return Math.min(Math.max(averageRating / 5, 0), 1);
}

/**
 * Computes the combined relevance score for a job given a freelancer's profile.
 */
export function computeRelevanceScore(params: {
  freelancerSkills: string[];
  jobSkills: string[];
  jobCategory: string;
  completedCategories: string[];
  jobCreatedAt: Date;
  clientAverageRating: number;
  now?: Date;
}): number {
  const skillScore = jaccardSimilarity(
    params.freelancerSkills,
    params.jobSkills
  );
  const catScore = categoryAffinityScore(
    params.jobCategory,
    params.completedCategories
  );
  const recScore = recencyScore(params.jobCreatedAt, params.now);
  const repScore = reputationScore(params.clientAverageRating);

  return (
    WEIGHTS.SKILL_OVERLAP * skillScore +
    WEIGHTS.CATEGORY_AFFINITY * catScore +
    WEIGHTS.RECENCY * recScore +
    WEIGHTS.REPUTATION * repScore
  );
}

export class RecommendationService {
  /**
   * Returns paginated job recommendations for a freelancer, scored by relevance.
   */
  static async getRecommendedJobs(
    userId: string,
    page: number = 1,
    limit: number = 10
  ) {
    const cacheKey = generateRecommendationsCacheKey(userId, page, limit);

    const { data, hit } = await cache(cacheKey, 60, async () => {
      // 1. Fetch freelancer's skills
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { skills: true, role: true },
      });

      if (!user || user.role !== "FREELANCER") {
        return null;
      }

      // 2. Get categories from freelancer's completed jobs
      const completedJobs = await prisma.job.findMany({
        where: { freelancerId: userId, status: "COMPLETED" },
        select: { category: true },
      });
      const completedCategories = [
        ...new Set(completedJobs.map((j) => j.category)),
      ];

      // 3. Get job IDs the freelancer already applied to (to exclude)
      const appliedApplications = await prisma.application.findMany({
        where: { freelancerId: userId },
        select: { jobId: true },
      });
      const appliedJobIds = appliedApplications.map((a) => a.jobId);

      // 4. Fetch all open, unflagged jobs (excluding own and already applied)
      const openJobs = await prisma.job.findMany({
        where: {
          status: "OPEN",
          isFlagged: false,
          clientId: { not: userId },
          id: { notIn: appliedJobIds.length > 0 ? appliedJobIds : undefined },
        },
        include: {
          client: {
            select: {
              id: true,
              username: true,
              avatarUrl: true,
              reviewsReceived: { select: { rating: true } },
            },
          },
          freelancer: { select: { id: true, username: true, avatarUrl: true } },
          milestones: true,
          _count: { select: { applications: true } },
        },
      });

      // 5. Score and sort
      const now = new Date();
      const scoredJobs = openJobs.map((job) => {
        const clientReviews = job.client.reviewsReceived || [];
        const clientAvgRating =
          clientReviews.length > 0
            ? clientReviews.reduce((sum, r) => sum + r.rating, 0) /
              clientReviews.length
            : 0;

        const relevanceScore = computeRelevanceScore({
          freelancerSkills: user.skills,
          jobSkills: job.skills,
          jobCategory: job.category,
          completedCategories,
          jobCreatedAt: job.createdAt,
          clientAverageRating: clientAvgRating,
          now,
        });

        // Strip reviewsReceived from client in the response
        const { reviewsReceived, ...clientData } = job.client as any;

        return {
          ...job,
          client: clientData,
          relevanceScore: Math.round(relevanceScore * 1000) / 1000,
        };
      });

      scoredJobs.sort((a, b) => b.relevanceScore - a.relevanceScore);

      // 6. Paginate
      const total = scoredJobs.length;
      const skip = (page - 1) * limit;
      const paginatedJobs = scoredJobs.slice(skip, skip + limit);

      return {
        data: paginatedJobs,
        total,
        page,
        totalPages: Math.ceil(total / limit),
      };
    });

    return data;
  }

  static async rebuildRecommendationsForJob(jobId: string): Promise<void> {
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      select: { id: true, status: true, deletedAt: true },
    });

    if (!job || job.deletedAt || job.status !== "OPEN") {
      await invalidateCache("recommendations:*");
      return;
    }

    await invalidateCache("recommendations:*");

    const freelancers = await prisma.user.findMany({
      where: {
        role: "FREELANCER",
        emailVerified: true,
      },
      select: { id: true },
    });

    for (const freelancer of freelancers) {
      await RecommendationService.getRecommendedJobs(freelancer.id, 1, 10);
    }
  }

  /**
   * Invalidate recommendation cache for a user when they apply to a job
   */
  static async invalidateUserRecommendations(userId: string) {
    await invalidateCache(`recommendations:${userId}:*`);
  }
}
