"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { Search, SlidersHorizontal, Briefcase } from "lucide-react";
import axios from "axios";
import JobCard from "@/components/JobCard";
import Pagination from "@/components/Pagination";
import FilterSidebar from "@/components/FilterSidebar";
import EmptyState from "@/components/EmptyState";
import { useJobFilters } from "@/hooks/useJobFilters";
import { useAuth } from "@/context/AuthContext";
import { Job, PaginatedResponse } from "@/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api";
const JOBS_PER_PAGE = 10;

function JobsContent() {
  const { user } = useAuth();
  const {
    filters,
    debouncedSearch,
    updateFilter,
    updateSearch,
    toggleArrayFilter,
    clearAll,
    activeCount,
    postedAfterDate,
  } = useJobFilters();

  const [jobs, setJobs] = useState<Job[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = {
        page: filters.page,
        limit: JOBS_PER_PAGE,
      };

      if (filters.sort !== "newest") params.sort = filters.sort;
      if (debouncedSearch) params.search = debouncedSearch;
      if (filters.skills.length) params.skills = filters.skills.join(",");
      if (filters.status.length) params.status = filters.status.join(",");
      if (filters.minBudget) params.minBudget = Number(filters.minBudget);
      if (filters.maxBudget) params.maxBudget = Number(filters.maxBudget);
      if (postedAfterDate) params.postedAfter = postedAfterDate;

      const res = await axios.get<PaginatedResponse<Job>>(`${API_URL}/jobs`, {
        params,
      });
      setJobs(res.data.data);
      setTotal(res.data.total);
      setTotalPages(res.data.totalPages);
    } catch {
      setJobs([]);
      setTotal(0);
      setTotalPages(0);
    } finally {
      setLoading(false);
    }
  }, [
    filters.page,
    filters.sort,
    filters.skills,
    filters.status,
    filters.minBudget,
    filters.maxBudget,
    debouncedSearch,
    postedAfterDate,
  ]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  const start = total > 0 ? (filters.page - 1) * JOBS_PER_PAGE + 1 : 0;
  const end = Math.min(filters.page * JOBS_PER_PAGE, total);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-theme-heading">Browse Jobs</h1>
        <button
          onClick={() => setDrawerOpen(true)}
          className="lg:hidden flex items-center gap-2 btn-secondary py-2 px-4 relative"
        >
          <SlidersHorizontal size={18} />
          <span>Filters</span>
          {activeCount > 0 && (
            <span className="absolute -top-2 -right-2 bg-stellar-blue text-white text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">
              {activeCount}
            </span>
          )}
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search
          className="absolute left-3 top-1/2 -translate-y-1/2 text-theme-text"
          size={18}
        />
        <input
          type="text"
          placeholder="Search jobs..."
          className="input-field pl-10"
          value={filters.search}
          onChange={(e) => updateSearch(e.target.value)}
        />
      </div>

      {/* Main layout: sidebar + results */}
      <div className="flex gap-8">
        <FilterSidebar
          filters={filters}
          updateFilter={updateFilter}
          toggleArrayFilter={toggleArrayFilter}
          clearAll={clearAll}
          activeCount={activeCount}
          isOpen={drawerOpen}
          onClose={() => setDrawerOpen(false)}
        />

        {/* Results */}
        <div className="flex-1 min-w-0">
          {/* Results count */}
          {!loading && (
            <p className="text-sm text-theme-text mb-4">
              Showing {start}
              {total > 0 && <>&ndash;{end}</>} of {total} jobs
            </p>
          )}

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="animate-pulse bg-theme-card border border-theme-border rounded-xl h-64"
                />
              ))}
            </div>
          ) : jobs.length > 0 ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {jobs.map((job) => (
                  <JobCard key={job.id} job={job} />
                ))}
              </div>
              <Pagination
                page={filters.page}
                totalPages={totalPages}
                total={total}
                limit={JOBS_PER_PAGE}
                onPageChange={(p) => updateFilter("page", p)}
              />
            </>
          ) : (
            <EmptyState
              icon={Briefcase}
              title="No jobs found matching your filters."
              description="Try adjusting or clearing your filters to broaden the search."
              action={
                user?.role === "CLIENT"
                  ? { label: "Post a Job", href: "/post-job" }
                  : activeCount > 0
                  ? { label: "Clear Filters", onClick: clearAll }
                  : undefined
              }
              secondaryAction={
                user?.role === "CLIENT" && activeCount > 0
                  ? { label: "Clear Filters", onClick: clearAll }
                  : undefined
              }
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default function JobsPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="animate-pulse bg-theme-card rounded-xl h-96" />
        </div>
      }
    >
      <JobsContent />
    </Suspense>
  );
}
