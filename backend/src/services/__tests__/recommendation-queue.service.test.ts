const lpopMock = jest.fn();
const rpushMock = jest.fn();
const connectMock = jest.fn();
const isRedisConnectedMock = jest.fn();
const rebuildRecommendationsForJobMock = jest.fn();

jest.mock("../../lib/redis", () => ({
  __esModule: true,
  default: {
    connect: (...args: unknown[]) => connectMock(...args),
    isRedisConnected: () => isRedisConnectedMock(),
    getInstance: () => ({
      lpop: (...args: unknown[]) => lpopMock(...args),
      rpush: (...args: unknown[]) => rpushMock(...args),
    }),
  },
}));

jest.mock("../recommendation.service", () => ({
  RecommendationService: {
    rebuildRecommendationsForJob: (...args: unknown[]) =>
      rebuildRecommendationsForJobMock(...args),
  },
}));

import { RecommendationQueueService } from "../recommendation-queue.service";

describe("RecommendationQueueService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    RecommendationQueueService.stopWorker();
  });

  it("enqueues recommendation rebuild jobs in Redis", async () => {
    isRedisConnectedMock.mockReturnValue(true);
    rpushMock.mockResolvedValue(1);

    await RecommendationQueueService.enqueueRebuild("job-123");

    expect(rpushMock).toHaveBeenCalledWith(
      "queue:recommendations:rebuild",
      JSON.stringify({ jobId: "job-123" }),
    );
  });

  it("drains queued jobs in the background worker", async () => {
    jest.useFakeTimers();
    isRedisConnectedMock.mockReturnValue(true);
    lpopMock
      .mockResolvedValueOnce(JSON.stringify({ jobId: "job-123" }))
      .mockResolvedValueOnce(null);
    rebuildRecommendationsForJobMock.mockResolvedValue(undefined);

    RecommendationQueueService.startWorker();
    jest.advanceTimersByTime(2_000);
    await Promise.resolve();
    await Promise.resolve();

    expect(rebuildRecommendationsForJobMock).toHaveBeenCalledWith("job-123");

    RecommendationQueueService.stopWorker();
    jest.useRealTimers();
  });
});
