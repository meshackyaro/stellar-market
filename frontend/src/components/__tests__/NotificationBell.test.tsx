import "@testing-library/jest-dom";
import React from "react";
import { render, screen, act, waitFor } from "@testing-library/react";
import NotificationBell from "@/components/NotificationBell";
import axios from "axios";

// ─── Mock axios ───────────────────────────────────────────────────────────────
jest.mock("axios");
const mockAxios = axios as jest.Mocked<typeof axios>;

// ─── Mock AuthContext ─────────────────────────────────────────────────────────
jest.mock("@/context/AuthContext", () => ({
  useAuth: () => ({
    token: "mock-token",
    user: { id: "1", username: "testuser" },
  }),
}));


// ─── Mock SocketContext ───────────────────────────────────────────────────────
const mockSocketHandlers: Record<string, ((...args: any[]) => void)[]> = {};
const mockSocket = {
  on: jest.fn((event: string, fn: (...args: any[]) => void) => {
    mockSocketHandlers[event] = mockSocketHandlers[event] ?? [];
    mockSocketHandlers[event].push(fn);
  }),
  off: jest.fn(),
  _trigger: (event: string, ...args: any[]) => {
    mockSocketHandlers[event]?.forEach((fn) => fn(...args));
  },
};

jest.mock("@/context/SocketContext", () => ({
  useSocket: () => ({ socket: mockSocket }),
}));

// ─── next/link stub ───────────────────────────────────────────────────────────
jest.mock("next/link", () => {
  return ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  );
});

describe("NotificationBell", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Object.keys(mockSocketHandlers).forEach((k) => delete mockSocketHandlers[k]);
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("renders the bell icon", async () => {
    mockAxios.get.mockResolvedValueOnce({ data: { count: 0 } });
    await act(async () => {
      render(<NotificationBell />);
    });
    expect(screen.getByLabelText("Notifications")).toBeInTheDocument();
  });

  it("fetches initial unread count on mount", async () => {
    mockAxios.get.mockResolvedValueOnce({ data: { count: 5 } });
    
    await act(async () => {
      render(<NotificationBell />);
    });

    expect(mockAxios.get).toHaveBeenCalledWith(expect.stringContaining("/notifications/unread-count"), expect.anything());
    await waitFor(() => {
      expect(screen.getByText("5")).toBeInTheDocument();
    });
  });

  it("updates count when notification:new socket event fires", async () => {
    mockAxios.get.mockResolvedValueOnce({ data: { count: 2 } });

    await act(async () => {
      render(<NotificationBell />);
    });

    await waitFor(() => {
      expect(screen.getByText("2")).toBeInTheDocument();
    });

    await act(async () => {
      mockSocket._trigger("notification:new", { id: "new-1" });
    });

    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("resets count when notifications:read socket event fires", async () => {
    mockAxios.get.mockResolvedValueOnce({ data: { count: 4 } });

    await act(async () => {
      render(<NotificationBell />);
    });

    await waitFor(() => {
      expect(screen.getByText("4")).toBeInTheDocument();
    });

    await act(async () => {
      mockSocket._trigger("notifications:read");
    });

    expect(screen.queryByText("4")).not.toBeInTheDocument();
  });

  it("polls for unread count every 30 seconds", async () => {
    mockAxios.get.mockResolvedValueOnce({ data: { count: 1 } }); // Initial mount

    await act(async () => {
      render(<NotificationBell />);
    });

    expect(mockAxios.get).toHaveBeenCalledTimes(1);

    // Fast-forward 30 seconds
    mockAxios.get.mockResolvedValueOnce({ data: { count: 10 } });
    await act(async () => {
      jest.advanceTimersByTime(30000);
    });

    expect(mockAxios.get).toHaveBeenCalledTimes(2);
    await waitFor(() => {
      expect(screen.getByText("10")).toBeInTheDocument();
    });
  });
});
