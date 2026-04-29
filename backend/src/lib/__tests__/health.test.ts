import { getHealthStatus } from "../health";

const connectMock = jest.fn();
const pingMock = jest.fn();
const isRedisConnectedMock = jest.fn();

jest.mock("../redis", () => ({
  __esModule: true,
  default: {
    connect: (...args: unknown[]) => connectMock(...args),
    getInstance: () => ({ ping: (...args: unknown[]) => pingMock(...args) }),
    isRedisConnected: () => isRedisConnectedMock(),
  },
}));

describe("getHealthStatus", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns ok when database and redis probes succeed", async () => {
    isRedisConnectedMock.mockReturnValue(true);
    pingMock.mockResolvedValue("PONG");
    const prisma = {
      $queryRawUnsafe: jest.fn().mockResolvedValue([{ "?column?": 1 }]),
    };

    const result = await getHealthStatus(prisma as any);

    expect(result).toEqual({
      status: "ok",
      service: "stellarmarket-api",
      checks: {
        database: "ok",
        redis: "ok",
      },
    });
  });

  it("returns degraded when a dependency probe fails", async () => {
    isRedisConnectedMock.mockReturnValue(false);
    connectMock.mockRejectedValue(new Error("redis down"));
    const prisma = {
      $queryRawUnsafe: jest.fn().mockRejectedValue(new Error("db down")),
    };

    const result = await getHealthStatus(prisma as any);

    expect(result.status).toBe("degraded");
    expect(result.checks).toEqual({
      database: "error",
      redis: "error",
    });
  });
});
