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
import ShareMenu from "@/components/ShareMenu";


const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";

function stroopsToXlm(stroops: string): number {
  try {
    return Number(BigInt(stroops || "0")) / 10_000_000;
  } catch {
    return 0;
  }
}

export default function JobDetailClient() {
  const { id } = useParams();
  const { address, signAndBroadcastTransaction } = useWallet();
  const { user } = useAuth();
  const [job, setJob] = useState<Job | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [actioningMilestoneId, setActioningMilestoneId] = useState<
    string | null
  >(null);
  const [confirmingMilestoneId, setConfirmingMilestoneId] = useState<
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

  const isClient = Boolean(job && address === job.client.walletAddress);

  const fetchJob = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      setHasApplied(false);

      const res = await axios.get(`${API_URL}/jobs/${id}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      setJob(res.data);

      setReviewsLoading(true);
      try {
        const reviewsRes = await axios.get<PaginatedResponse<Review>>(
          `${API_URL}/reviews`,
          {
            params: { jobId: id, page: 1, limit: 50 },
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
              params: { jobId: id, freelancerId: user.id, limit: 1 },
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
  }, [id, user]);

  useEffect(() => {
    fetchJob();
  }, [fetchJob]);

  const fetchApplications = useCallback(async () => {
    setLoadingApps(true);
    try {
      const token = localStorage.getItem("token");
      const res = await axios.get<{ data: Application[] }>(
        `${API_URL}/jobs/${id as string}/applications`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      );
      setApplications(res.data.data ?? []);
    } catch {
      setApplications([]);
    } finally {
      setLoadingApps(false);
    }
  }, [id]);

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
    const previousMilestones = job?.milestones ?? [];
    setJob((prev) =>
      prev
        ? {
            ...prev,
            milestones: prev.milestones.map((m) =>
              m.id === milestoneId ? { ...m, status: "APPROVED" } : m,
            ),
          }
        : prev,
    );
    setConfirmingMilestoneId(milestoneId);
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
      // Roll back optimistic milestone status if on-chain confirmation fails.
      setJob((prev) =>
        prev
          ? {
              ...prev,
              milestones: prev.milestones.map((m) =>
                m.id === milestoneId
                  ? {
                      ...m,
                      status:
                        previousMilestones.find((pm) => pm.id === milestoneId)
                          ?.status ?? m.status,
                    }
                  : m,
              ),
            }
          : prev,
      );
      setError(err instanceof Error ? err.message : "Action failed.");
    } finally {
      setConfirmingMilestoneId(null);
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

  if (!job) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-12 text-center">
        <h1 className="text-2xl font-bold text-theme-heading mb-4">
          Job Not Found
        </h1>
        <Link href="/jobs" className="text-stellar-blue hover:underline">
          Return to browse jobs
        </Link>
      </div>
    );
  }

  const isFreelancerOnJob = Boolean(
    job.freelancer &&
    user?.id === job.freelancer.id &&
    address === job.freelancer.walletAddress,
  );
  const isOwnJob = user?.id === job.client.id || isClient;
  const isOwner = user?.id === job.client.id;
  const isPartyOnJob = Boolean(
    user &&
    address &&
    ((user.id === job.client.id && address === job.client.walletAddress) ||
      isFreelancerOnJob),
  );
  const pendingRevision = job.revisionProposal ?? null;
  const canRespondToRevision = Boolean(
    pendingRevision &&
    address &&
    pendingRevision.proposer !== address &&
    isPartyOnJob,
  );
  const isRevisionProposer = Boolean(
    pendingRevision && address && pendingRevision.proposer === address,
  );
  const showProposeRevisionCta =
    job.status === "IN_PROGRESS" &&
    job.escrowStatus === "FUNDED" &&
    job.contractJobId &&
    isPartyOnJob &&
    !pendingRevision;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <Link
        href="/jobs"
        className="flex items-center gap-2 text-theme-text hover:text-theme-heading mb-8 transition-colors"
      >
        <ArrowLeft size={18} /> Back to Jobs
      </Link>

      {error && (
        <div className="mb-6 p-4 bg-theme-error/10 border border-theme-error/20 rounded-lg flex items-start gap-3 text-theme-error">
          <AlertCircle className="flex-shrink-0 mt-0.5" size={18} />
          <p className="text-sm">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Main Content */}
        <div className="lg:col-span-2">
          <div className="flex items-start justify-between mb-4">
            <span className="text-sm font-medium text-stellar-purple bg-stellar-purple/10 px-3 py-1 rounded">
              {job.category}
            </span>
            <div className="flex gap-2">
              <StatusBadge status={job.status} />
              <StatusBadge status={job.escrowStatus} />
            </div>
          </div>

          <h1 className="text-3xl font-bold text-theme-heading mb-4">
            {job.title}
          </h1>

          <div className="flex flex-wrap items-center gap-4 mb-8">
            <ShareMenu
              title={job.title}
              url={typeof window !== "undefined" ? window.location.href : ""}
              description={`Check out this job on StellarMarket: ${job.title}`}
            />
          </div>

          <div className="card mb-8">
            <h2 className="text-lg font-semibold text-theme-heading mb-4">
              Description
            </h2>
            <div className="text-theme-text whitespace-pre-line text-sm leading-relaxed">
              {job.description}
            </div>
          </div>

          {pendingRevision && canRespondToRevision && (
            <div className="card mb-8 border-amber-500/40 bg-amber-500/5">
              <h2 className="text-lg font-semibold text-theme-heading mb-2">
                Pending revision proposal
              </h2>
              <p className="text-sm text-theme-text mb-3">
                The other party proposed new milestones and a budget of{" "}
                <span className="font-semibold text-stellar-blue">
                  {stroopsToXlm(
                    pendingRevision.newTotalStroops,
                  ).toLocaleString()}{" "}
                  XLM
                </span>
                . Review the milestones below, then accept or reject on-chain.
              </p>
              <ul className="space-y-2 mb-4 text-sm text-theme-text">
                {pendingRevision.milestones.map((m, i) => (
                  <li
                    key={`${m.id}-${i}`}
                    className="p-3 rounded-lg bg-theme-bg border border-theme-border"
                  >
                    <div className="font-medium text-theme-heading">
                      {m.description || `Milestone ${i + 1}`}
                    </div>
                    <div className="text-xs mt-1">
                      {stroopsToXlm(m.amountStroops).toLocaleString()} XLM · due{" "}
                      {new Date(m.deadline * 1000).toLocaleDateString()}
                    </div>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={processing}
                  onClick={() => void handleRevisionEscrow("accept")}
                  className="btn-primary py-2 px-4 text-sm flex items-center gap-2"
                >
                  {processing ? (
                    <Loader2 className="animate-spin" size={16} />
                  ) : (
                    <CheckCircle size={16} />
                  )}
                  Accept revision
                </button>
                <button
                  type="button"
                  disabled={processing}
                  onClick={() => void handleRevisionEscrow("reject")}
                  className="btn-secondary py-2 px-4 text-sm border-theme-error text-theme-error hover:bg-theme-error/10 flex items-center gap-2"
                >
                  {processing ? (
                    <Loader2 className="animate-spin" size={16} />
                  ) : (
                    <XCircle size={16} />
                  )}
                  Reject
                </button>
              </div>
            </div>
          )}

          {pendingRevision && isRevisionProposer && (
            <div className="card mb-8 border-stellar-blue/30 bg-stellar-blue/5">
              <p className="text-sm text-theme-text">
                You have a pending revision proposal. The other party must
                accept or reject it before escrow can move forward with the new
                scope.
              </p>
            </div>
          )}

          {/* Milestones */}
          <div className="card">
            <h2 className="text-lg font-semibold text-theme-heading mb-4">
              Milestones
            </h2>
            <MilestoneTimeline
              milestones={job.milestones}
              isClient={isClient}
              isFreelancerOnJob={isFreelancerOnJob}
              actioningMilestoneId={actioningMilestoneId}
              recentlyApprovedMilestoneId={recentlyApprovedMilestoneId}
              onSubmitMilestone={(milestoneId) => void handleSubmitMilestone(milestoneId)}
              onApproveMilestone={(milestoneId) => void handleApproveMilestone(milestoneId)}
              onRequestRevision={(milestoneId) =>
                void handleUpdateMilestoneStatus(milestoneId, "REJECTED")
              }
              confirmingMilestoneId={confirmingMilestoneId}
            />
          </div>

          {job.status === "COMPLETED" && !myReview && (
            <div className="card mt-8 border-stellar-blue/30 bg-stellar-blue/5">
              <h2 className="text-lg font-semibold text-theme-heading mb-2">
                Leave a review
              </h2>
              <p className="text-sm text-theme-text mb-4">
                This job is complete. Share your experience to help build trust
                on StellarMarket.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => setReviewModalOpen(true)}
                >
                  Review now
                </button>
                <Link
                  href={`/jobs/${job.id}/review`}
                  className="btn-secondary"
                >
                  Open review page
                </Link>
              </div>
            </div>
          )}

          {/* Reviews */}
          <div className="card mt-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-theme-heading">
                Reviews
              </h2>
              {myReview ? (
                <span className="text-xs text-theme-text">Already reviewed</span>
              ) : null}
            </div>

            {reviewsLoading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="animate-spin text-stellar-blue" size={28} />
              </div>
            ) : reviews.length === 0 ? (
              <p className="text-sm text-theme-text">No reviews yet.</p>
            ) : (
              <div className="space-y-4">
                {reviews.map((review) => (
                  <div
                    key={review.id}
                    className="p-4 bg-theme-bg rounded-lg border border-theme-border"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-stellar-blue to-stellar-purple flex items-center justify-center text-white text-sm font-bold overflow-hidden">
                          {review.reviewer.avatarUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={review.reviewer.avatarUrl}
                              alt={review.reviewer.username}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            review.reviewer.username.charAt(0).toUpperCase()
                          )}
                        </div>
                        <div>
                          <div className="text-sm font-medium text-theme-heading">
                            {review.reviewer.username}
                          </div>
                          <div className="text-xs text-theme-text">
                            {new Date(review.createdAt).toLocaleDateString()}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Star
                            key={star}
                            size={16}
                            className={
                              star <= review.rating
                                ? "fill-yellow-400 text-yellow-400"
                                : "text-theme-border"
                            }
                          />
                        ))}
                      </div>
                    </div>
                    <p className="text-sm text-theme-text mt-3 whitespace-pre-line">
                      {review.comment}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {job.status === "COMPLETED" && !myReview && (
            <div className="card mt-8 border-stellar-blue/30 bg-stellar-blue/5">
              <h2 className="text-lg font-semibold text-theme-heading mb-2">
                Leave a review
              </h2>
              <p className="text-sm text-theme-text mb-4">
                This job is complete. Share your experience to help build trust
                on StellarMarket.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => setReviewModalOpen(true)}
                >
                  Review now
                </button>
                <Link
                  href={`/jobs/${job.id}/review`}
                  className="btn-secondary"
                >
                  Open review page
                </Link>
              </div>
            </div>
          )}

          {/* Reviews */}
          <div className="card mt-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-theme-heading">
                Reviews
              </h2>
              {myReview ? (
                <span className="text-xs text-theme-text">Already reviewed</span>
              ) : null}
            </div>

            {reviewsLoading ? (
              <div className="flex justify-center py-6">
                <Loader2 className="animate-spin text-stellar-blue" size={28} />
              </div>
            ) : reviews.length === 0 ? (
              <p className="text-sm text-theme-text">No reviews yet.</p>
            ) : (
              <div className="space-y-4">
                {reviews.map((review) => (
                  <div
                    key={review.id}
                    className="p-4 bg-theme-bg rounded-lg border border-theme-border"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-stellar-blue to-stellar-purple flex items-center justify-center text-white text-sm font-bold overflow-hidden">
                          {review.reviewer.avatarUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={review.reviewer.avatarUrl}
                              alt={review.reviewer.username}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            review.reviewer.username.charAt(0).toUpperCase()
                          )}
                        </div>
                        <div>
                          <div className="text-sm font-medium text-theme-heading">
                            {review.reviewer.username}
                          </div>
                          <div className="text-xs text-theme-text">
                            {new Date(review.createdAt).toLocaleDateString()}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Star
                            key={star}
                            size={16}
                            className={
                              star <= review.rating
                                ? "fill-yellow-400 text-yellow-400"
                                : "text-theme-border"
                            }
                          />
                        ))}
                      </div>
                    </div>
                    <p className="text-sm text-theme-text mt-3 whitespace-pre-line">
                      {review.comment}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
          {/* Applicants — visible to owning client only */}
          {isOwnJob && (
            <div className="card mt-8">
              <h2 className="text-lg font-semibold text-theme-heading mb-4">
                Applicants
              </h2>
              {loadingApps ? (
                <div className="flex justify-center py-8">
                  <Loader2
                    className="animate-spin text-stellar-blue"
                    size={32}
                  />
                </div>
              ) : applications.length === 0 ? (
                <p className="text-theme-text text-sm py-4 text-center">
                  No applications yet.
                </p>
              ) : (
                <div className="space-y-4">
                  {applications.map((app) => (
                    <div
                      key={app.id}
                      className="flex items-center justify-between p-4 bg-theme-bg rounded-lg border border-theme-border"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-stellar-blue to-stellar-purple flex items-center justify-center text-white text-sm font-bold">
                          {app.freelancer.username.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-theme-heading text-sm">
                            {app.freelancer.username}
                          </p>
                          <p className="text-xs text-theme-text">
                            Bid: {app.bidAmount.toLocaleString()} XLM
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={app.status} />
                        {app.status === "PENDING" && (
                          <>
                            <button
                              disabled={actioningApp === app.id}
                              onClick={() =>
                                void handleApplicationStatus(app.id, "ACCEPTED")
                              }
                              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-green-500/10 text-green-400 hover:bg-green-500/20 transition-colors disabled:opacity-50"
                            >
                              {actioningApp === app.id ? (
                                <Loader2 size={12} className="animate-spin" />
                              ) : (
                                <UserCheck size={12} />
                              )}
                              Accept
                            </button>
                            <button
                              disabled={actioningApp === app.id}
                              onClick={() =>
                                void handleApplicationStatus(app.id, "REJECTED")
                              }
                              className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-theme-error/10 text-theme-error hover:bg-theme-error/20 transition-colors disabled:opacity-50"
                            >
                              {actioningApp === app.id ? (
                                <Loader2 size={12} className="animate-spin" />
                              ) : (
                                <XCircle size={12} />
                              )}
                              Reject
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <div className="card">
            <div className="flex items-center gap-2 mb-4">
              <DollarSign className="text-stellar-blue" size={20} />
              <span className="text-2xl font-bold text-theme-heading">
                {job.budget.toLocaleString()} XLM
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm text-theme-text mb-4">
              <Clock size={14} />
              Posted {new Date(job.createdAt).toLocaleDateString()}
            </div>

            {/* Escrow Status Actions */}
            {isClient && !job.contractJobId && job.status === "IN_PROGRESS" && (
              <button
                disabled={processing}
                onClick={() => handleEscrowAction("init")}
                className="btn-primary w-full flex items-center justify-center gap-2 mb-4"
              >
                {processing ? (
                  <Loader2 className="animate-spin" size={18} />
                ) : (
                  <ShieldCheck size={18} />
                )}
                Initialize On-Chain Escrow
              </button>
            )}

            {isClient &&
              job.contractJobId &&
              job.escrowStatus === "UNFUNDED" && (
                <button
                  disabled={processing}
                  onClick={() => handleEscrowAction("fund")}
                  className="btn-secondary w-full flex items-center justify-center gap-2 mb-4 border-stellar-blue text-stellar-blue hover:bg-stellar-blue/10"
                >
                  {processing ? (
                    <Loader2 className="animate-spin" size={18} />
                  ) : (
                    <DollarSign size={18} />
                  )}
                  Fund Escrow with XLM
                </button>
              )}

            {/* Apply section — freelancers only, non-owners */}
            {user?.role === "FREELANCER" &&
              !isOwnJob &&
              job.status === "OPEN" &&
              (hasApplied ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-center gap-2 w-full py-2 px-4 rounded-lg bg-green-500/10 text-green-400 text-sm font-medium border border-green-500/20">
                    <CheckCircle size={16} /> Applied
                  </div>
                  <button
                    className="btn-secondary w-full flex items-center justify-center gap-2 border-theme-error text-theme-error hover:bg-theme-error/10 text-sm"
                    onClick={() => setWithdrawConfirmOpen(true)}
                  >
                    Withdraw Application
                  </button>
                </div>
              ) : (
                <button
                  className="btn-primary w-full"
                  onClick={() => setApplyModalOpen(true)}
                >
                  Apply for this Job
                </button>
              ))}

            {isOwner && (
              <div className="p-3 bg-stellar-purple/10 border border-stellar-purple/20 rounded-lg text-sm text-stellar-purple flex items-center justify-center gap-2">
                <CheckCircle size={16} />
                You posted this job
              </div>
            )}

            {job.escrowStatus === "FUNDED" && (
              <div className="p-3 bg-stellar-blue/10 border border-stellar-blue/20 rounded-lg text-xs text-stellar-blue flex items-center gap-2 mb-4">
                <ShieldCheck size={16} />
                Funds are secured in escrow
              </div>
            )}

            {/* Mark as Complete button - client only, when all milestones approved */}
            {isClient &&
              job.status === "IN_PROGRESS" &&
              job.milestones.every((m) => m.status === "APPROVED") && (
                <button
                  disabled={processing}
                  onClick={handleCompleteJob}
                  className="btn-primary w-full flex items-center justify-center gap-2 mb-4"
                >
                  {processing ? (
                    <Loader2 className="animate-spin" size={18} />
                  ) : (
                    <CheckCircle size={18} />
                  )}
                  Mark Job as Complete
                </button>
              )}

            {/* Propose Revision button */}
            {showProposeRevisionCta && (
              <button
                type="button"
                disabled={processing}
                onClick={() => setProposeRevisionOpen(true)}
                className="btn-secondary w-full flex items-center justify-center gap-2 mb-4 border-stellar-purple text-stellar-purple hover:bg-stellar-purple/10"
              >
                <PencilLine size={18} />
                Propose revision
              </button>
            )}

            {/* Raise Dispute button - only if escrow is funded */}
            {isOwnJob &&
              job.status === "IN_PROGRESS" &&
              job.escrowStatus === "FUNDED" && (
                <button
                  className="btn-secondary w-full flex items-center justify-center gap-2 border-theme-error text-theme-error hover:bg-theme-error/10"
                  onClick={() => setDisputeModalOpen(true)}
                >
                  <AlertCircle size={18} /> Raise Dispute
                </button>
              )}

            {/* Show tooltip if trying to dispute unfunded job */}
            {isOwnJob &&
              job.status === "IN_PROGRESS" &&
              job.escrowStatus !== "FUNDED" && (
                <div className="p-3 bg-theme-error/10 border border-theme-error/20 rounded-lg text-xs text-theme-error">
                  Escrow must be funded before a dispute can be raised
                </div>
              )}
          </div>

          <div className="card">
            <h3 className="font-semibold text-theme-heading mb-4">
              About the Client
            </h3>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-stellar-blue to-stellar-purple" />
              <div>
                <div className="font-medium text-theme-heading">
                  {job.client.username}
                </div>
                <div className="text-xs text-theme-text">
                  {job.client.walletAddress.slice(0, 8)}...
                  {job.client.walletAddress.slice(-8)}
                </div>
              </div>
            </div>
            <p className="text-sm text-theme-text mb-4">{job.client.bio}</p>
            <Link
              href={`/messages/${job.client.id}-${job.id}`}
              className="btn-secondary w-full flex items-center justify-center gap-2"
            >
              <MessageSquare size={18} /> Message Client
            </Link>
          </div>
        </div>
      </div>

      {job.status === "OPEN" && !isOwnJob && (
        <ApplyModal
          job={job}
          isOpen={applyModalOpen}
          onClose={() => setApplyModalOpen(false)}
          onSuccess={() => setHasApplied(true)}
        />
      )}

      {isOwnJob && (
        <RaiseDisputeModal
          job={job}
          isOpen={disputeModalOpen}
          onClose={() => setDisputeModalOpen(false)}
          onSuccess={() => {
            setDisputeModalOpen(false);
            fetchJob();
          }}
        />
      )}

      {/* Review Modal - shown after job completion */}
      {job.freelancer && (
        <ReviewModal
          job={job}
          revieweeId={isClient ? job.freelancer.id : job.client.id}
          revieweeName={
            isClient ? job.freelancer.username : job.client.username
          }
          revieweeWalletAddress={
            isClient ? job.freelancer.walletAddress : job.client.walletAddress
          }
          isOpen={reviewModalOpen}
          onClose={() => {
            setReviewModalOpen(false);
          }}
          onSuccess={() => {
            fetchJob();
          }}
        />
      )}

      {showProposeRevisionCta && (
        <ProposeRevisionModal
          isOpen={proposeRevisionOpen}
          onClose={() => setProposeRevisionOpen(false)}
          initialRows={revisionInitialMilestones}
          processing={processing}
          onSubmit={async (milestones) => {
            await handleRevisionEscrow("propose", milestones);
          }}
        />
      )}

      {/* Withdraw Application confirmation dialog */}
      {withdrawConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-theme-card border border-theme-border rounded-xl shadow-2xl w-full max-w-md p-6">
            <h2 className="text-lg font-semibold text-theme-heading mb-2">
              Withdraw Application?
            </h2>
            <p className="text-sm text-theme-text mb-6">
              Are you sure you want to withdraw your application for{" "}
              <span className="font-medium text-theme-heading">
                {job.title}
              </span>
              ? This cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setWithdrawConfirmOpen(false)}
                className="btn-secondary"
                disabled={withdrawing}
              >
                Cancel
              </button>
              <button
                onClick={() => void handleWithdrawApplication()}
                disabled={withdrawing}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-theme-error text-white text-sm font-medium hover:bg-theme-error/90 transition-colors disabled:opacity-50"
              >
                {withdrawing ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : null}
                Withdraw
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
