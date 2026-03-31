"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  Briefcase,
  FileText,
  MessageSquare,
  Star,
  DollarSign,
  Loader2,
  Plus,
  Search,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Trash2,
  CheckCircle2,
  Clock,
  Send,
  XCircle,
  Eye,
  ChevronRight,
} from "lucide-react";
import axios from "axios";
import Link from "next/link";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import StatusBadge from "@/components/StatusBadge";
import { useAuth } from "@/context/AuthContext";
import { Job, Application, PaginatedResponse } from "@/types";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000/api";

interface DashboardStats {
  postedJobs: number;
  openJobs: number;
  inProgressJobs: number;
  completedJobs: number;
  applicationsToReview: number;
  activeDisputes: number;
  totalSpent: number;
  activeWork: number;
  totalApplications: number;
  pendingApplications: number;
  acceptedApplications: number;
  rejectedApplications: number;
  totalEarned: number;
  pendingPayout: number;
  rating: number;
}

interface Dispute {
  id: string;
  reason: string;
  status: string;
  job: { id: string; title: string };
  createdAt: string;
}

interface MilestoneItem {
  id: string;
  title: string;
  status: string;
  jobId: string;
  job?: { title: string };
  contractDeadline?: string;
}

export default function DashboardPage() {
  const { user, token, isLoading } = useAuth();
  const { socket } = useSocket();
  const isClient = user?.role === "CLIENT";

  const clientTabs = ["My Posted Jobs", "Applicants to Review", "Active Disputes", "Messages"];
  const freelancerTabs = ["My Applications", "Active Work", "Upcoming Milestones", "Messages"];
  const tabs = isClient ? clientTabs : freelancerTabs;

  const [activeTab, setActiveTab] = useState(freelancerTabs[0]);
  const [stats, setStats] = useState<DashboardStats>({
    postedJobs: 0, openJobs: 0, inProgressJobs: 0, completedJobs: 0,
    applicationsToReview: 0, activeDisputes: 0, totalSpent: 0,
    activeWork: 0, totalApplications: 0, pendingApplications: 0,
    acceptedApplications: 0, rejectedApplications: 0,
    totalEarned: 0, pendingPayout: 0, rating: 0,
  });

  const [postedJobs, setPostedJobs] = useState<Job[]>([]);
  const [pendingApplicants, setPendingApplicants] = useState<Application[]>([]);
  const [activeJobs, setActiveJobs] = useState<Job[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [milestones, setMilestones] = useState<MilestoneItem[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  // Withdraw-application state (freelancer)
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null);
  const [withdrawConfirmId, setWithdrawConfirmId] = useState<string | null>(null);

  const [jobs, setJobs] = useState<ExtendedJob[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);

  const fetchDashboardData = useCallback(async () => {
    if (!token || !user) return;
    setDataLoading(true);

    const headers = { Authorization: `Bearer ${token}` };

    try {
      if (isClient) {
        const [jobsRes, appsRes, disputesRes] = await Promise.all([
          axios.get<PaginatedResponse<Job>>(`${API}/jobs?page=1&limit=100`, { headers }).catch(() => null),
          axios.get<PaginatedResponse<Application>>(`${API}/applications?page=1&limit=100`, { headers }).catch(() => null),
          axios.get<PaginatedResponse<Dispute>>(`${API}/disputes?page=1&limit=100`, { headers }).catch(() => null),
        ]);

        const jobs = jobsRes?.data?.data?.filter((j: Job) => j.client?.id === user.id) ?? [];
        const apps = appsRes?.data?.data ?? [];
        const disps = disputesRes?.data?.data ?? [];

        setPostedJobs(jobs);
        setPendingApplicants(apps.filter((a: Application) => a.status === "PENDING"));
        setDisputes(disps.filter((d) => d.status === "OPEN" || d.status === "VOTING"));

        setStats((prev) => ({
          ...prev,
          postedJobs: jobs.length,
          openJobs: jobs.filter((j: Job) => j.status === "OPEN").length,
          inProgressJobs: jobs.filter((j: Job) => j.status === "IN_PROGRESS").length,
          completedJobs: jobs.filter((j: Job) => j.status === "COMPLETED").length,
          applicationsToReview: apps.filter((a: Application) => a.status === "PENDING").length,
          activeDisputes: disps.filter((d) => d.status === "OPEN" || d.status === "VOTING").length,
          totalSpent: jobs.filter((j: Job) => j.status === "COMPLETED").reduce((sum: number, j: Job) => sum + j.budget, 0),
          rating: user.averageRating ?? 0,
        }));
      } else {
        const [appsRes, jobsRes] = await Promise.all([
          axios.get<PaginatedResponse<Application>>(`${API}/applications?freelancerId=${user.id}&page=1&limit=100`, { headers }).catch(() => null),
          axios.get<PaginatedResponse<Job>>(`${API}/jobs?page=1&limit=100`, { headers }).catch(() => null),
        ]);

        const apps = appsRes?.data?.data ?? [];
        const allJobs = jobsRes?.data?.data ?? [];
        const myActiveJobs = allJobs.filter((j: Job) => j.freelancer?.id === user.id && j.status === "IN_PROGRESS");

        setApplications(apps);
        setActiveJobs(myActiveJobs);

        // Collect milestones from active jobs
        const upcomingMilestones = myActiveJobs.flatMap((j: Job) =>
          (j.milestones ?? [])
            .filter((m) => m.status === "PENDING" || m.status === "IN_PROGRESS")
            .map((m) => ({ ...m, job: { title: j.title } }))
        );
        setMilestones(upcomingMilestones);

        const completedJobs = allJobs.filter((j: Job) => j.freelancer?.id === user.id && j.status === "COMPLETED");

        setStats((prev) => ({
          ...prev,
          activeWork: myActiveJobs.length,
          totalApplications: apps.length,
          pendingApplications: apps.filter((a: Application) => a.status === "PENDING").length,
          acceptedApplications: apps.filter((a: Application) => a.status === "ACCEPTED").length,
          rejectedApplications: apps.filter((a: Application) => a.status === "REJECTED").length,
          totalEarned: completedJobs.reduce((sum: number, j: Job) => sum + j.budget, 0),
          pendingPayout: myActiveJobs.reduce((sum: number, j: Job) => sum + j.budget, 0),
          rating: user.averageRating ?? 0,
        }));
      }
    } catch (err) {
      console.error("Failed to fetch dashboard data:", err);
    } finally {
      setDataLoading(false);
    }
  }, [token, user, isClient]);

  const fetchPendingApplicants = useCallback(async () => {
    if (!token || !user?.id || !isClient) return;
    setApplicantsLoading(true);
    try {
      const jobsRes = await axios.get(`${API_URL}/jobs/mine`, {
        params: { limit: 100 },
        headers: { Authorization: `Bearer ${token}` },
      });
      const clientJobs: ExtendedJob[] = (jobsRes.data.data ?? []).filter(
        (j: ExtendedJob) => j.client?.id === user.id && j.status === "OPEN"
      );

      const allApps: ExtendedApplication[] = [];
      for (const job of clientJobs) {
        try {
          const appsRes = await axios.get(`${API_URL}/jobs/${job.id}/applications`, {
            params: { status: "PENDING", limit: 20 },
            headers: { Authorization: `Bearer ${token}` },
          });
          const apps = (appsRes.data.data ?? []).map((a: ExtendedApplication) => ({
            ...a,
            job: { id: job.id, title: job.title },
          }));
          allApps.push(...apps);
        } catch {
          // Skip jobs with fetch errors
        }
      }
      setPendingApplicants(allApps);
    } catch {
      setPendingApplicants([]);
    } finally {
      setApplicantsLoading(false);
    }
  }, [token, user?.id, isClient]);

  useEffect(() => {
    fetchStats();
    fetchWeeklyData();
  }, [fetchStats, fetchWeeklyData]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const handleWithdraw = async (appId: string) => {
    setWithdrawingId(appId);
    try {
      await axios.delete(`${API}/applications/${appId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setApplications((prev) => prev.filter((a) => a.id !== appId));
      fetchStats();
    } catch {
      // Keep list unchanged on error
    } finally {
      setWithdrawingId(null);
      setWithdrawConfirmId(null);
    }
  };

  const clientStatCards = [
    { label: "Posted Jobs", value: `${stats.postedJobs}`, detail: `${stats.openJobs} open · ${stats.inProgressJobs} funded · ${stats.completedJobs} completed`, icon: Briefcase, color: "text-stellar-blue" },
    { label: "Pending Applications", value: `${stats.applicationsToReview}`, detail: "Awaiting your review", icon: FileText, color: "text-yellow-400" },
    { label: "Active Disputes", value: `${stats.activeDisputes}`, detail: "Require attention", icon: AlertTriangle, color: "text-red-400" },
    { label: "Total Spent", value: `${stats.totalSpent.toLocaleString()} XLM`, detail: `Rating: ${stats.rating > 0 ? `${stats.rating.toFixed(1)}/5` : "N/A"}`, icon: DollarSign, color: "text-stellar-purple" },
  ];

  const freelancerStatCards = [
    { label: "Active Work", value: `${stats.activeWork}`, detail: "Jobs in progress", icon: Briefcase, color: "text-stellar-blue" },
    { label: "Applications", value: `${stats.totalApplications}`, detail: `${stats.pendingApplications} pending · ${stats.acceptedApplications} accepted`, icon: FileText, color: "text-yellow-400" },
    { label: "Total Earned", value: `${stats.totalEarned.toLocaleString()} XLM`, detail: `Pending: ${stats.pendingPayout.toLocaleString()} XLM`, icon: DollarSign, color: "text-stellar-purple" },
    { label: "Rating", value: stats.rating > 0 ? `${stats.rating.toFixed(1)}/5` : "N/A", detail: `${user?.reviewCount ?? 0} reviews`, icon: Star, color: "text-green-400" },
  ];

  const displayStats = isClient ? clientStatCards : freelancerStatCards;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="animate-spin text-stellar-blue" size={48} />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-theme-heading">Dashboard</h1>
        {isClient ? (
          <Link href="/post-job" className="btn-primary flex items-center gap-2">
            <Plus size={18} />
            Post a Job
          </Link>
        ) : (
          <Link href="/jobs" className="btn-primary flex items-center gap-2">
            <Search size={18} />
            Browse Jobs
          </Link>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {displayStats.map((stat) => (
          <div key={stat.label} className="card flex items-center gap-4">
            <div className={`${stat.color}`}>
              <stat.icon size={24} />
            </div>
            <div>
              <div className="text-2xl font-bold text-theme-heading">
                {dataLoading ? "—" : stat.value}
              </div>
              <div className="text-sm text-theme-text">{stat.label}</div>
              <div className="text-xs text-theme-text/60 mt-0.5">{dataLoading ? "" : stat.detail}</div>
            </div>
          ))
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-4 mb-6 border-b border-theme-border overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`pb-3 px-1 text-sm font-medium transition-colors border-b-2 whitespace-nowrap ${
              activeTab === tab
                ? "text-stellar-blue border-stellar-blue"
                : "text-theme-text border-transparent hover:text-theme-heading"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {dataLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-stellar-blue" size={32} />
        </div>
      ) : (
        <>
          {/* ── Freelancer tab content ── */}
          {!isClient && activeTab === "My Applications" && (
            <div className="space-y-4">
              {applications.length > 0 ? (
                applications.map((app) => (
                  <div key={app.id} className="card flex items-center justify-between gap-4">
                    <Link href={`/jobs/${app.jobId}`} className="min-w-0 flex-1 hover:opacity-80 transition-opacity">
                      <h3 className="font-semibold text-theme-heading truncate">
                        {(app as Application & { job?: { title?: string } }).job?.title ?? app.proposal?.slice(0, 60) ?? "Application"}
                      </h3>
                      <p className="text-sm text-theme-text">
                        Bid: {app.bidAmount?.toLocaleString()} XLM &middot; Applied: {new Date(app.createdAt).toLocaleDateString()}
                      </p>
                    </Link>
                    <div className="flex items-center gap-2 shrink-0">
                      <StatusBadge status={app.status} />
                      {app.status === "PENDING" && (
                        <button
                          onClick={() => setWithdrawConfirmId(app.id)}
                          disabled={withdrawingId === app.id}
                          className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-theme-error/50 text-theme-error hover:bg-theme-error/10 transition-colors disabled:opacity-50"
                          title="Withdraw application"
                        >
                          {withdrawingId === app.id ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <Trash2 size={12} />
                          )}
                          Withdraw
                        </button>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="card text-center py-12">
                  <FileText className="mx-auto text-theme-text mb-4" size={40} />
                  <h3 className="text-lg font-semibold text-theme-heading mb-2">No applications yet</h3>
                  <p className="text-theme-text mb-4">Start applying to jobs to see them here.</p>
                  <Link href="/jobs" className="btn-primary inline-flex items-center gap-2">
                    <Search size={16} /> Browse Jobs
                  </Link>
                </div>
              )}
            </div>
          )}

          {/* Withdraw confirmation dialog */}
          {withdrawConfirmId && (() => {
            const app = applications.find((a) => a.id === withdrawConfirmId);
            const jobTitle = (app as Application & { job?: { title?: string } } | undefined)?.job?.title ?? "this job";
            return (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                <div className="bg-theme-card border border-theme-border rounded-xl shadow-2xl w-full max-w-md p-6">
                  <h2 className="text-lg font-semibold text-theme-heading mb-2">
                    Withdraw Application?
                  </h2>
                  <p className="text-sm text-theme-text mb-6">
                    Withdraw your application for{" "}
                    <span className="font-medium text-theme-heading">{jobTitle}</span>?
                    This cannot be undone.
                  </p>
                  <div className="flex gap-3 justify-end">
                    <button
                      onClick={() => setWithdrawConfirmId(null)}
                      className="btn-secondary"
                      disabled={!!withdrawingId}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => void handleWithdraw(withdrawConfirmId)}
                      disabled={!!withdrawingId}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-theme-error text-white text-sm font-medium hover:bg-theme-error/90 transition-colors disabled:opacity-50"
                    >
                      {withdrawingId ? <Loader2 size={14} className="animate-spin" /> : null}
                      Withdraw
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}

          {!isClient && activeTab === "Active Work" && (
            <div className="space-y-4">
              {activeJobs.length > 0 ? (
                activeJobs.map((job) => (
                  <Link key={job.id} href={`/jobs/${job.id}`} className="card flex items-center justify-between hover:border-stellar-blue/30 transition-colors">
                    <div>
                      <h3 className="font-semibold text-theme-heading">{job.title}</h3>
                      <p className="text-sm text-theme-text">
                        Client: {job.client?.username ?? "Unknown"} &middot; Deadline: {new Date(job.deadline).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-sm font-medium text-stellar-purple">
                        {job.budget.toLocaleString()} XLM
                      </span>
                      <StatusBadge status={job.status} />
                    </div>
                  </Link>
                ))
              ) : (
                <div className="card text-center py-12">
                  <Briefcase className="mx-auto text-theme-text mb-4" size={40} />
                  <h3 className="text-lg font-semibold text-theme-heading mb-2">No active work</h3>
                  <p className="text-theme-text">Jobs you&apos;re working on will appear here.</p>
                </div>
              )}
            </div>
          )}

          {!isClient && activeTab === "Upcoming Milestones" && (
            <div className="space-y-4">
              {milestones.length > 0 ? (
                milestones.map((milestone) => (
                  <Link key={milestone.id} href={`/jobs/${milestone.jobId}`} className="card flex items-center justify-between hover:border-stellar-blue/30 transition-colors">
                    <div>
                      <h3 className="font-semibold text-theme-heading">{milestone.title}</h3>
                      <p className="text-sm text-theme-text">
                        {milestone.job?.title}
                        {milestone.contractDeadline && (
                          <> &middot; Due: {new Date(milestone.contractDeadline).toLocaleDateString()}</>
                        )}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock size={14} className="text-yellow-400" />
                      <StatusBadge status={milestone.status} />
                    </div>
                  </Link>
                ))
              ) : (
                <div className="card text-center py-12">
                  <Clock className="mx-auto text-theme-text mb-4" size={40} />
                  <h3 className="text-lg font-semibold text-theme-heading mb-2">No upcoming milestones</h3>
                  <p className="text-theme-text">Milestone deadlines will appear here once you have active jobs.</p>
                </div>
              )}
            </div>
          )}

          {/* ── Client tab content ── */}
          {isClient && activeTab === "My Posted Jobs" && (
            <div className="space-y-4">
              {postedJobs.length > 0 ? (
                postedJobs.map((job) => (
                  <Link key={job.id} href={`/jobs/${job.id}`} className="card flex items-center justify-between hover:border-stellar-blue/30 transition-colors">
                    <div>
                      <h3 className="font-semibold text-theme-heading">{job.title}</h3>
                      <p className="text-sm text-theme-text">
                        {job._count?.applications ?? 0} applicant{(job._count?.applications ?? 0) !== 1 ? "s" : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-sm font-medium text-stellar-purple">
                        {job.budget.toLocaleString()} XLM
                      </span>
                      <StatusBadge status={job.status} />
                    </div>
                  </Link>
                ))
              ) : (
                <div className="card text-center py-12">
                  <Briefcase className="mx-auto text-theme-text mb-4" size={40} />
                  <h3 className="text-lg font-semibold text-theme-heading mb-2">No jobs posted yet</h3>
                  <p className="text-theme-text mb-4">Post your first job to find talented freelancers.</p>
                  <Link href="/post-job" className="btn-primary inline-flex items-center gap-2">
                    <Plus size={16} /> Post a Job
                  </Link>
                </div>
              )}
            </div>
          )}

          {isClient && activeTab === "Applicants to Review" && (
            <div className="space-y-4">
              {pendingApplicants.length > 0 ? (
                pendingApplicants.map((app) => (
                  <Link key={app.id} href={`/jobs/${app.jobId}`} className="card flex items-center justify-between hover:border-stellar-blue/30 transition-colors">
                    <div>
                      <h3 className="font-semibold text-theme-heading">
                        {app.freelancer?.username ?? "Unknown Freelancer"}
                      </h3>
                      <p className="text-sm text-theme-text">
                        Applied: {new Date(app.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-stellar-purple">
                        {app.bidAmount?.toLocaleString()} XLM
                      </span>
                      <StatusBadge status="PENDING" />
                    </div>
                  </Link>
                ))
              ) : (
                <div className="card text-center py-12">
                  <CheckCircle2 className="mx-auto text-theme-text mb-4" size={40} />
                  <h3 className="text-lg font-semibold text-theme-heading mb-2">All caught up!</h3>
                  <p className="text-theme-text">No pending applications to review.</p>
                </div>
              )}
            </div>
          )}

          {isClient && activeTab === "Active Disputes" && (
            <div className="space-y-4">
              {disputes.length > 0 ? (
                disputes.map((dispute) => (
                  <Link key={dispute.id} href="/disputes" className="card flex items-center justify-between hover:border-stellar-blue/30 transition-colors">
                    <div>
                      <h3 className="font-semibold text-theme-heading">{dispute.job?.title ?? "Dispute"}</h3>
                      <p className="text-sm text-theme-text">
                        {dispute.reason?.slice(0, 80)}...
                      </p>
                      <p className="text-xs text-theme-text/60 mt-1">
                        Opened: {new Date(dispute.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <AlertTriangle size={14} className="text-red-400" />
                      <StatusBadge status={dispute.status} />
                    </div>
                  </Link>
                ))
              ) : (
                <div className="card text-center py-12">
                  <CheckCircle2 className="mx-auto text-green-400 mb-4" size={40} />
                  <h3 className="text-lg font-semibold text-theme-heading mb-2">No active disputes</h3>
                  <p className="text-theme-text">All clear! No disputes require your attention.</p>
                </div>
              )}
            </div>
          )}

          {/* ── Shared Messages tab ── */}
          {activeTab === "Messages" && (
            <div className="card text-center py-12">
              <MessageSquare className="mx-auto text-theme-text mb-4" size={40} />
              <h3 className="text-lg font-semibold text-theme-heading mb-2">
                No messages yet
              </h3>
              <p className="text-theme-text">
                Messages from{" "}
                {isClient ? "freelancers" : "clients"} will appear here.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
