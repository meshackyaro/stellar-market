"use client";

import { useState, useEffect } from "react";
import {
  Briefcase,
  FileText,
  MessageSquare,
  Star,
  DollarSign,
  Loader2,
  Plus,
} from "lucide-react";
import Link from "next/link";
import StatusBadge from "@/components/StatusBadge";
import Skeleton from "@/components/Skeleton";
import { useAuth } from "@/context/AuthContext";

interface Job {
  id: string;
  title: string;
  status: string;
  budget: number;
  deadline: string;
  client?: { id: string; username: string; avatarUrl: string | null };
  freelancer?: { id: string; username: string; avatarUrl: string | null };
  _count?: { applications: number };
}

interface Application {
  id: string;
  status: string;
  createdAt: string;
  bidAmount: number;
  job: { id: string; title: string };
  freelancer?: { id: string; username: string; avatarUrl: string | null };
}

interface TransactionStats {
  totalEarned: number;
  totalSpent: number;
  netBalance: number;
}

export default function DashboardPage() {
  const { user, isLoading: authLoading, token } = useAuth();
  const isClient = user?.role === "CLIENT";

  const [activeTab, setActiveTab] = useState("");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [transactionStats, setTransactionStats] =
    useState<TransactionStats | null>(null);
  const [isLoadingJobs, setIsLoadingJobs] = useState(true);
  const [isLoadingApplications, setIsLoadingApplications] = useState(true);
  const [isLoadingStats, setIsLoadingStats] = useState(true);

  const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000/api";

  const clientTabs = ["My Posted Jobs", "Applicants to Review", "Messages"];
  const freelancerTabs = ["My Applications", "Active Work", "Messages"];
  const tabs = isClient ? clientTabs : freelancerTabs;

  // Set initial tab when role is known
  useEffect(() => {
    if (user) {
      setActiveTab(isClient ? clientTabs[0] : freelancerTabs[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isClient, user]);

  // Fetch jobs
  useEffect(() => {
    const fetchJobs = async () => {
      if (!user || !token) return;

      setIsLoadingJobs(true);
      try {
        const response = await fetch(`${API}/users/${user.id}/jobs?limit=100`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (response.ok) {
          const data = await response.json();
          setJobs(data.data || []);
        }
      } catch (error) {
        console.error("Error fetching jobs:", error);
      } finally {
        setIsLoadingJobs(false);
      }
    };

    fetchJobs();
  }, [user, token, API]);

  // Fetch applications (for freelancers)
  useEffect(() => {
    const fetchApplications = async () => {
      if (!user || !token || isClient) {
        setIsLoadingApplications(false);
        return;
      }

      setIsLoadingApplications(true);
      try {
        const response = await fetch(
          `${API}/applications?freelancerId=${user.id}&limit=100`,
          {
            headers: { Authorization: `Bearer ${token}` },
          },
        );

        if (response.ok) {
          const data = await response.json();
          setApplications(data.data || []);
        }
      } catch (error) {
        console.error("Error fetching applications:", error);
      } finally {
        setIsLoadingApplications(false);
      }
    };

    fetchApplications();
  }, [user, token, isClient, API]);

  // Fetch transaction stats
  useEffect(() => {
    const fetchStats = async () => {
      if (!user || !token) return;

      setIsLoadingStats(true);
      try {
        const response = await fetch(`${API}/transactions/summary/stats`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (response.ok) {
          const data = await response.json();
          setTransactionStats(data);
        }
      } catch (error) {
        console.error("Error fetching transaction stats:", error);
      } finally {
        setIsLoadingStats(false);
      }
    };

    fetchStats();
  }, [user, token, API]);

  // Fetch applicants for client's jobs
  const [applicants, setApplicants] = useState<Application[]>([]);
  const [isLoadingApplicants, setIsLoadingApplicants] = useState(true);

  useEffect(() => {
    const fetchApplicants = async () => {
      if (!user || !token || !isClient) {
        setIsLoadingApplicants(false);
        return;
      }

      setIsLoadingApplicants(true);
      try {
        // Fetch applications for all client's jobs
        const clientJobs = jobs.filter((j) => j.client?.id === user.id);
        const allApplicants: Application[] = [];

        for (const job of clientJobs) {
          const response = await fetch(
            `${API}/jobs/${job.id}/applications?limit=100`,
            {
              headers: { Authorization: `Bearer ${token}` },
            },
          );

          if (response.ok) {
            const data = await response.json();
            allApplicants.push(...(data.data || []));
          }
        }

        setApplicants(allApplicants.filter((a) => a.status === "PENDING"));
      } catch (error) {
        console.error("Error fetching applicants:", error);
      } finally {
        setIsLoadingApplicants(false);
      }
    };

    if (jobs.length > 0 && isClient) {
      fetchApplicants();
    } else {
      setIsLoadingApplicants(false);
    }
  }, [jobs, user, token, isClient, API]);

  // Calculate stats
  const activeJobsCount = jobs.filter(
    (j) => j.status === "IN_PROGRESS" || j.status === "OPEN",
  ).length;

  const applicationsCount = applications.length;

  const postedJobsCount = jobs.filter((j) => j.client?.id === user?.id).length;
  const applicantsToReviewCount = applicants.length;

  const clientStats = [
    {
      label: "Posted Jobs",
      value: isLoadingJobs ? "..." : postedJobsCount.toString(),
      icon: Briefcase,
      color: "text-stellar-blue",
    },
    {
      label: "Applicants to Review",
      value: isLoadingApplicants ? "..." : applicantsToReviewCount.toString(),
      icon: FileText,
      color: "text-yellow-400",
    },
    {
      label: "Total Spent",
      value: isLoadingStats
        ? "..."
        : `${(transactionStats?.totalSpent || 0).toLocaleString()} XLM`,
      icon: DollarSign,
      color: "text-stellar-purple",
    },
    {
      label: "Rating",
      value: user?.averageRating ? `${user.averageRating.toFixed(1)}/5` : "N/A",
      icon: Star,
      color: "text-green-400",
    },
  ];

  const freelancerStats = [
    {
      label: "Active Work",
      value: isLoadingJobs ? "..." : activeJobsCount.toString(),
      icon: Briefcase,
      color: "text-stellar-blue",
    },
    {
      label: "My Applications",
      value: isLoadingApplications ? "..." : applicationsCount.toString(),
      icon: FileText,
      color: "text-yellow-400",
    },
    {
      label: "Income Received",
      value: isLoadingStats
        ? "..."
        : `${(transactionStats?.totalEarned || 0).toLocaleString()} XLM`,
      icon: DollarSign,
      color: "text-stellar-purple",
    },
    {
      label: "Rating",
      value: user?.averageRating ? `${user.averageRating.toFixed(1)}/5` : "N/A",
      icon: Star,
      color: "text-green-400",
    },
  ];

  const stats = isClient ? clientStats : freelancerStats;

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="animate-spin text-stellar-blue" size={48} />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <h1 className="text-3xl font-bold text-theme-heading mb-8">Dashboard</h1>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {stats.map((stat) => (
          <div key={stat.label} className="card flex items-center gap-4">
            <div className={`${stat.color}`}>
              <stat.icon size={24} />
            </div>
            <div>
              <div className="text-2xl font-bold text-theme-heading">
                {stat.value}
              </div>
              <div className="text-sm text-theme-text">{stat.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-4 mb-6 border-b border-theme-border">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`pb-3 px-1 text-sm font-medium transition-colors border-b-2 ${
              activeTab === tab
                ? "text-stellar-blue border-stellar-blue"
                : "text-theme-text border-transparent hover:text-theme-heading"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* ── Freelancer tab content ── */}
      {!isClient && activeTab === "My Applications" && (
        <div className="space-y-4">
          {isLoadingApplications ? (
            <>
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
            </>
          ) : applications.length === 0 ? (
            <div className="card text-center py-12">
              <FileText className="mx-auto text-theme-text mb-4" size={40} />
              <h3 className="text-lg font-semibold text-theme-heading mb-2">
                No applications yet
              </h3>
              <p className="text-theme-text mb-4">
                Start applying to jobs to see them here.
              </p>
              <Link href="/jobs" className="btn-primary inline-block">
                Browse Jobs
              </Link>
            </div>
          ) : (
            applications.map((app) => (
              <Link
                key={app.id}
                href={`/jobs/${app.job.id}`}
                className="card flex items-center justify-between hover:border-stellar-blue transition-colors"
              >
                <div>
                  <h3 className="font-semibold text-theme-heading">
                    {app.job.title}
                  </h3>
                  <p className="text-sm text-theme-text">
                    Applied: {new Date(app.createdAt).toLocaleDateString()} •
                    Bid: {app.bidAmount.toLocaleString()} XLM
                  </p>
                </div>
                <StatusBadge status={app.status} />
              </Link>
            ))
          )}
        </div>
      )}

      {!isClient && activeTab === "Active Work" && (
        <div className="space-y-4">
          {isLoadingJobs ? (
            <>
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
            </>
          ) : jobs.filter(
              (j) =>
                j.freelancer?.id === user?.id &&
                (j.status === "IN_PROGRESS" || j.status === "OPEN"),
            ).length === 0 ? (
            <div className="card text-center py-12">
              <Briefcase className="mx-auto text-theme-text mb-4" size={40} />
              <h3 className="text-lg font-semibold text-theme-heading mb-2">
                No active work
              </h3>
              <p className="text-theme-text mb-4">
                Jobs you&apos;re working on will appear here.
              </p>
              <Link href="/jobs" className="btn-primary inline-block">
                Browse Jobs
              </Link>
            </div>
          ) : (
            jobs
              .filter(
                (j) =>
                  j.freelancer?.id === user?.id &&
                  (j.status === "IN_PROGRESS" || j.status === "OPEN"),
              )
              .map((job) => (
                <Link
                  key={job.id}
                  href={`/jobs/${job.id}`}
                  className="card flex items-center justify-between hover:border-stellar-blue transition-colors"
                >
                  <div>
                    <h3 className="font-semibold text-theme-heading">
                      {job.title}
                    </h3>
                    <p className="text-sm text-theme-text">
                      Client: {job.client?.username || "Unknown"} • Deadline:{" "}
                      {new Date(job.deadline).toLocaleDateString()}
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
          )}
        </div>
      )}

      {/* ── Client tab content ── */}
      {isClient && activeTab === "My Posted Jobs" && (
        <div className="space-y-4">
          {isLoadingJobs ? (
            <>
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
            </>
          ) : jobs.filter((j) => j.client?.id === user?.id).length === 0 ? (
            <div className="card text-center py-12">
              <Briefcase className="mx-auto text-theme-text mb-4" size={40} />
              <h3 className="text-lg font-semibold text-theme-heading mb-2">
                No jobs posted yet
              </h3>
              <p className="text-theme-text mb-4">
                Post your first job to get started.
              </p>
              <Link
                href="/post-job"
                className="btn-primary inline-flex items-center gap-2"
              >
                <Plus size={20} />
                Post a Job
              </Link>
            </div>
          ) : (
            jobs
              .filter((j) => j.client?.id === user?.id)
              .map((job) => (
                <Link
                  key={job.id}
                  href={`/jobs/${job.id}`}
                  className="card flex items-center justify-between hover:border-stellar-blue transition-colors"
                >
                  <div>
                    <h3 className="font-semibold text-theme-heading">
                      {job.title}
                    </h3>
                    <p className="text-sm text-theme-text">
                      {job._count?.applications || 0} applicant
                      {job._count?.applications !== 1 ? "s" : ""}
                      {job.freelancer &&
                        ` • Freelancer: ${job.freelancer.username}`}
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
          )}
        </div>
      )}

      {isClient && activeTab === "Applicants to Review" && (
        <div className="space-y-4">
          {isLoadingApplicants ? (
            <>
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
            </>
          ) : applicants.length === 0 ? (
            <div className="card text-center py-12">
              <FileText className="mx-auto text-theme-text mb-4" size={40} />
              <h3 className="text-lg font-semibold text-theme-heading mb-2">
                No pending applicants
              </h3>
              <p className="text-theme-text">
                Applications to your jobs will appear here.
              </p>
            </div>
          ) : (
            applicants.map((app) => (
              <Link
                key={app.id}
                href={`/jobs/${app.job.id}`}
                className="card flex items-center justify-between hover:border-stellar-blue transition-colors"
              >
                <div>
                  <h3 className="font-semibold text-theme-heading">
                    {app.freelancer?.username || "Unknown"}
                  </h3>
                  <p className="text-sm text-theme-text">
                    {app.job.title} • Applied:{" "}
                    {new Date(app.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-stellar-purple">
                    {app.bidAmount.toLocaleString()} XLM
                  </span>
                  <StatusBadge status={app.status} />
                </div>
              </Link>
            ))
          )}
        </div>
      )}

      {/* ── Shared Messages tab ── */}
      {activeTab === "Messages" && (
        <div className="card text-center py-12">
          <MessageSquare className="mx-auto text-theme-text mb-4" size={40} />
          <h3 className="text-lg font-semibold text-theme-heading mb-2">
            Messages
          </h3>
          <p className="text-theme-text mb-4">
            View and manage your conversations.
          </p>
          <Link href="/messages" className="btn-primary inline-block">
            Go to Messages
          </Link>
        </div>
      )}
    </div>
  );
}
