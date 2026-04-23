import { Metadata } from "next";
import JobDetailClient from "./JobDetailClient";
"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import {
  Clock,
  DollarSign,
  ArrowLeft,
  MessageSquare,
  ShieldCheck,
  AlertCircle,
  Loader2,
  CheckCircle,
  UserCheck,
  XCircle,
  PencilLine,
  Star,
} from "lucide-react";
import Link from "next/link";
import axios from "axios";
import { useWallet } from "@/context/WalletContext";
import { useAuth } from "@/context/AuthContext";
import { useSocket } from "@/context/SocketContext";
import StatusBadge from "@/components/StatusBadge";
import ApplyModal from "@/components/ApplyModal";
import RaiseDisputeModal from "@/components/RaiseDisputeModal";
import ReviewModal from "@/components/ReviewModal";
import MilestoneTimeline from "@/components/MilestoneTimeline";
import ProposeRevisionModal, {
  type ProposeRevisionMilestoneInput,
} from "@/components/ProposeRevisionModal";
import { Job, Application, PaginatedResponse, Review } from "@/types";
import { parseJobIdFromResult } from "@/utils/stellar";


const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

async function getJob(id: string) {
  try {
    const res = await fetch(`${API_URL}/jobs/${id}`, { next: { revalidate: 60 } });
    if (!res.ok) return null;
    return res.json();
  } catch (error) {
    console.error("Error fetching job for metadata:", error);
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  const job = await getJob(params.id);
 if (!job) {
    return {
      title: "Job Not Found | StellarMarket",
      description: "The requested job could not be found.",
    };
  }

  return {
    title: `${job.title} | StellarMarket`,
    description: job.description?.substring(0, 160) || "Check out this job on StellarMarket",
    openGraph: {
      title: job.title,
      description: job.description,
      images: job.image ? [job.image] : [],
    },
    twitter: {
      card: "summary_large_image",
      title: job.title,
      description: job.description,
    },
  };
}
export default function JobDetailPage() {
  const { id } = useParams();
  const { address, signAndBroadcastTransaction } = useWallet();
  const { user } = useAuth();
  const { socket } = useSocket();
  const [job, setJob] = useState<Job | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [actioningMilestoneId, setActioningMilestoneId] = useState<
    string | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [applyModalOpen, setApplyModalOpen] = useState(false);
  const [disputeModalOpen, setDisputeModalOpen] = useState(false);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [hasApplied, setHasApplied] = useState(false);
  const [myApplicationId, setMyApplicationId] = useState<string | null>(null);
  const [withdrawConfirmOpen, setWithdrawConfirmOpen] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [applications, setApplications] = useState<Application[]>([]);
  const [loadingApps, setLoadingApps] = useState(false);
  const [actioningApp, setActioningApp] = useState<string | null>(null);
  const [proposeRevisionOpen, setProposeRevisionOpen] = useState(false);
  const [recentlyApprovedMilestoneId, setRecentlyApprovedMilestoneId] = useState<
    string | null
  >(null);
  const [extendDeadlineDate, setExtendDeadlineDate] = useState<Record<string, string>>({});
  const jobId = Array.isArray(id) ? id[0] : id;

  const isClient = Boolean(job && address === job.client.walletAddress);

  const fetchJob = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      setHasApplied(false);

      const res = await axios.get(`${API_URL}/jobs/${jobId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      setJob(res.data);

      setReviewsLoading(true);
      try {
        const reviewsRes = await axios.get<PaginatedResponse<Review>>(
          `${API_URL}/reviews`,
          {
            params: { jobId, page: 1, limit: 50 },
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          },
        );
        setReviews(reviewsRes.data.data ?? []);
      } catch {
        setReviews([]);
      } finally {
        setReviewsLoading(false);
      }

      if (token && user?.role === "FREELANCER") {
        try {
          const appsRes = await axios.get<PaginatedResponse<Application>>(
            `${API_URL}/applications`,
            {
              params: { jobId, freelancerId: user.id, limit: 1 },
              headers: { Authorization: `Bearer ${token}` },
            },
          );
          const applied = appsRes.data.total > 0;
          setHasApplied(applied);
          if (applied && appsRes.data.data[0]) {
            setMyApplicationId(appsRes.data.data[0].id);
          }
        } catch {
          setHasApplied(false);
          setMyApplicationId(null);
        }
      }
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to fetch job details.",
      );
    } finally {
      setLoading(false);
    }
  }, [jobId, user]);

  const refetchMilestones = useCallback(async () => {
    await fetchJob();
  }, [fetchJob]);

  useEffect(() => {
    fetchJob();
  }, [fetchJob]);

  useEffect(() => {
    if (!socket || !jobId) return;

    const handleMilestoneUpdated = (data: { jobId?: string | number }) => {
      if (String(data?.jobId ?? "") === jobId) {
        void refetchMilestones();
      }
    };

    socket.on("milestone:updated", handleMilestoneUpdated);
    socket.on("milestone:status_changed", handleMilestoneUpdated);

    return () => {
      socket.off("milestone:updated", handleMilestoneUpdated);
      socket.off("milestone:status_changed", handleMilestoneUpdated);
    };
  }, [jobId, refetchMilestones, socket]);

  const fetchApplications = useCallback(async () => {
    setLoadingApps(true);
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get<{ data: Application[] }>(
        `${API_URL}/jobs/${jobId}/applications`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      );
      setApplications(res.data.data ?? []);
    } catch {
      setApplications([]);
    } finally {
      setLoadingApps(false);
    }
  }, [jobId]);

  // Fetch applicants once job loads and current user is the owner
  useEffect(() => {
    if (job && user && user.id === job.client.id) {
      void fetchApplications();
    }
  }, [job, user, fetchApplications]);

  const handleApplicationStatus = async (
    appId: string,
    status: "ACCEPTED" | "REJECTED",
  ) => {
    setActioningApp(appId);
    try {
      const token = localStorage.getItem("token");
      await axios.put(
        `${API_URL}/applications/${appId}/status`,
        { status },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      await fetchApplications();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to update application.",
      );
    } finally {
      setActioningApp(null);
    }
  };

  const myReview = useMemo(() => {
    if (!user) return null;
    return reviews.find((r) => r.reviewerId === user.id) ?? null;
  }, [reviews, user]);

  useEffect(() => {
    if (!recentlyApprovedMilestoneId) return;
    if (!job) return;

    const timer = window.setTimeout(() => {
      setRecentlyApprovedMilestoneId(null);
    }, 1600);

    const allApproved = job.milestones.every((m) => m.status === "APPROVED");
    if (allApproved && isClient && job.status === "IN_PROGRESS") {
      setRecentlyApprovedMilestoneId(null);
      void handleCompleteJob();
    }

    return () => window.clearTimeout(timer);
  }, [job, isClient, recentlyApprovedMilestoneId]);

  const handleWithdrawApplication = async () => {
    if (!myApplicationId) return;
    setWithdrawing(true);
    try {
      const token = localStorage.getItem("stellarmarket_jwt");
      await axios.delete(`${API_URL}/applications/${myApplicationId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setHasApplied(false);
      setMyApplicationId(null);
      setWithdrawConfirmOpen(false);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to withdraw application.",
      );
    } finally {
      setWithdrawing(false);
    }
  };

  const handleEscrowAction = async (
    action: "init" | "fund" | "approve" | "submit" | "extend-deadline",
    milestoneId?: string,
  ) => {
    setError(null);
    setProcessing(true);
    try {
      const token = localStorage.getItem("token");
      let endpoint = "";
      let payload: Record<string, unknown> = { jobId: id };
      let type = "";

      if (action === "init") {
        endpoint = "/escrow/init-create";
        type = "CREATE_JOB";
      } else if (action === "fund") {
        endpoint = "/escrow/init-fund";
        type = "FUND_JOB";
      } else if (action === "approve") {
        endpoint = "/escrow/init-approve";
        payload = { milestoneId };
        type = "APPROVE_MILESTONE";
      } else if (action === "submit") {
        endpoint = "/escrow/init-submit";
        payload = { milestoneId };
        type = "SUBMIT_MILESTONE";
      }

      // 1. Get XDR from backend
      const res = await axios.post(`${API_URL}${endpoint}`, payload, {
        headers: { Authorization: `Bearer ${token}` },
      });

      // 2. Sign and broadcast via WalletContext
      const txResult = await signAndBroadcastTransaction(res.data.xdr);

      if (!txResult.success) {
        throw new Error(txResult.error || "Transaction failed");
      }

      // 3. Confirm with backend
      // For CREATE_JOB, parse the on-chain job ID from the contract return value.
      // For other actions, use the existing contractJobId stored on the job.
      let onChainJobId: number | string | undefined;
      if (action === "init") {
        if (!txResult.resultXdr) {
          throw new Error("Transaction succeeded but no return value was found — cannot determine on-chain job ID");
        }
        onChainJobId = parseJobIdFromResult(txResult.resultXdr);
      } else {
        onChainJobId = job?.contractJobId;
      }

      await axios.post(
        `${API_URL}/escrow/confirm-tx`,
        {
          hash: txResult.hash,
          type,
          jobId: id,
          milestoneId,
          newDeadline:
            action === "extend-deadline"
              ? extendDeadlineDate[milestoneId!]
              : undefined,
          onChainJobId,
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      // 4. Refresh data
      await fetchJob();

      if (action === "approve" && milestoneId) {
        setRecentlyApprovedMilestoneId(milestoneId);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Action failed.");
    } finally {
      setProcessing(false);
    }
  };

  const handleCompleteJob = async () => {
    setError(null);
    setProcessing(true);
    try {
      const token = localStorage.getItem("token");
      await axios.patch(
        `${API_URL}/jobs/${id}/complete`,
        {},
        { headers: { Authorization: `Bearer ${token}` } },
      );

      await fetchJob();

      // Show review modal after completion
      if (!myReview) {
        setReviewModalOpen(true);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to complete job.");
    } finally {
      setProcessing(false);
    }
  };

  const handleUpdateMilestoneStatus = async (
    milestoneId: string,
    status: string,
  ) => {
    setError(null);
    setActioningMilestoneId(milestoneId);
    try {
      const token =
        localStorage.getItem("stellarmarket_jwt") ??
        localStorage.getItem("token");
      await axios.patch(
        `${API_URL}/milestones/${milestoneId}/status`,
        { status },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      await fetchJob();
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to update milestone status.",
      );
    } finally {
      setActioningMilestoneId(null);
    }
  };

  const handleSubmitMilestone = async (milestoneId: string) => {
    setError(null);
    setActioningMilestoneId(milestoneId);
    try {
      const token =
        localStorage.getItem("stellarmarket_jwt") ??
        localStorage.getItem("token");

      if (!token) {
        throw new Error("Please log in again.");
      }

      const res = await axios.put(
        `${API_URL}/milestones/${milestoneId}/submit`,
        {},
        { headers: { Authorization: `Bearer ${token}` } },
      );

      const txResult = await signAndBroadcastTransaction(res.data.xdr);
      if (!txResult.success) {
        throw new Error(txResult.error || "Transaction failed");
      }

      await axios.post(
        `${API_URL}/escrow/confirm-tx`,
        {
          hash: txResult.hash,
          type: "SUBMIT_MILESTONE",
          jobId: id,
          milestoneId,
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );

      await fetchJob();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Action failed.");
    } finally {
      setActioningMilestoneId(null);
    }
  };

  const handleApproveMilestone = async (milestoneId: string) => {
    setError(null);
    setActioningMilestoneId(milestoneId);
    try {
      const token =
        localStorage.getItem("stellarmarket_jwt") ??
        localStorage.getItem("token");

      if (!token) {
        throw new Error("Please log in again.");
      }

      const res = await axios.put(
        `${API_URL}/milestones/${milestoneId}/approve`,
        {},
        { headers: { Authorization: `Bearer ${token}` } },
      );

      const txResult = await signAndBroadcastTransaction(res.data.xdr);
      if (!txResult.success) {
        throw new Error(txResult.error || "Transaction failed");
      }

      await axios.post(
        `${API_URL}/escrow/confirm-tx`,
        {
          hash: txResult.hash,
          type: "APPROVE_MILESTONE",
          jobId: id,
          milestoneId,
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );

      await fetchJob();
      setRecentlyApprovedMilestoneId(milestoneId);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Action failed.");
    } finally {
      setActioningMilestoneId(null);
    }
  };

  const handleRevisionEscrow = async (
    action: "propose" | "accept" | "reject",
    milestones?: ProposeRevisionMilestoneInput[],
  ) => {
    setError(null);
    setProcessing(true);
    try {
      const token = localStorage.getItem("token");
      let endpoint = "";
      let type = "";
      const payload: Record<string, unknown> = { jobId: id };

      if (action === "propose") {
        endpoint = "/escrow/init-propose-revision";
        type = "PROPOSE_REVISION";
        payload.milestones = milestones;
      } else if (action === "accept") {
        endpoint = "/escrow/init-accept-revision";
        type = "ACCEPT_REVISION";
      } else {
        endpoint = "/escrow/init-reject-revision";
        type = "REJECT_REVISION";
      }

      const res = await axios.post(`${API_URL}${endpoint}`, payload, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const txResult = await signAndBroadcastTransaction(res.data.xdr);
      if (!txResult.success) {
        throw new Error(txResult.error || "Transaction failed");
      }

      await axios.post(
        `${API_URL}/escrow/confirm-tx`,
        { hash: txResult.hash, type, jobId: id },
        { headers: { Authorization: `Bearer ${token}` } },
      );

      setProposeRevisionOpen(false);
      await fetchJob();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Revision transaction failed.",
      );
    } finally {
      setProcessing(false);
    }
  };

  const revisionInitialMilestones =
    useMemo((): ProposeRevisionMilestoneInput[] => {
      if (!job?.milestones?.length) return [];
      return job.milestones.map((m) => ({
        title: m.title,
        amount: m.amount,
        deadline: m.contractDeadline
          ? new Date(m.contractDeadline).toISOString()
          : new Date(job.deadline).toISOString(),
      }));
    }, [job]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="animate-spin text-stellar-blue" size={48} />
      </div>
    );
  }

 

export default function JobDetailPage() {
  return <JobDetailClient />;
}
