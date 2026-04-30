"use client";

import { useEffect, useCallback, useState } from "react";
import { useSocket } from "@/context/SocketContext";
import { Job } from "@/types";

interface UseLiveJobFeedReturn {
  pendingJobs: Job[];
  clearPending: () => void;
}

export function useLiveJobFeed(enabled: boolean): UseLiveJobFeedReturn {
  const { socket } = useSocket();
  const [pendingJobs, setPendingJobs] = useState<Job[]>([]);

  useEffect(() => {
    if (!enabled || !socket) return;

    const handleJobCreated = (job: Job) => {
      setPendingJobs((prev) => {
        // Avoid duplicates if the event fires more than once
        if (prev.some((j) => j.id === job.id)) return prev;
        return [job, ...prev];
      });
    };

    socket.on("job:created", handleJobCreated);

    return () => {
      socket.off("job:created", handleJobCreated);
    };
  }, [enabled, socket]);

  // Clear the queue when the feed is disabled
  useEffect(() => {
    if (!enabled) {
      setPendingJobs([]);
    }
  }, [enabled]);

  const clearPending = useCallback(() => {
    setPendingJobs([]);
  }, []);

  return { pendingJobs, clearPending };
}
