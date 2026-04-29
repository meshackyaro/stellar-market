"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { Search, SlidersHorizontal, Briefcase, Loader2 } from "lucide-react";
import axios from "axios";
import JobCard from "@/components/JobCard";
import JobCardSkeleton from "@/components/skeletons/JobCardSkeleton";
import FilterSidebar from "@/components/FilterSidebar";
import EmptyState from "@/components/EmptyState";
import { useJobFilters } from "@/hooks/useJobFilters";
import { useInfiniteScroll } from "@/hooks/useInfiniteScroll";
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
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Store the filter "signature" so we can detect when filters change (reset to page 1)
  const filterKey = JSON.stringify({
    debouncedSearch,
    skills: filters.skills,
    status: filters.status,
    minBudget: filters.minBudget,
    maxBudget: filters.maxBudget,
    sort: filters.sort,
    postedAfterDate,
  });
  const prevFilterKey = useRef(filterKey);

  const buildParams = useCallback(
    (p: number) => {
      const params: Record<string, string | number> = {
        page: p,
        limit: JOBS_PER_PAGE,
      };
      if (filters.sort !== "newest") params.sort = filters.sort;
      if (debouncedSearch) params.search = debouncedSearch;
      if (filters.skills.length) params.skills = filters.skills.join(",");
      if (filters.status.length) params.status = filters.status.join(",");
      if (filters.minBudget) params.minBudget = Number(filters.minBudget);
      if (filters.maxBudget) params.maxBudget = Number(filters.maxBudget);
      if (postedAfterDate) params.postedAfter = postedAfterDate;
      return params;
    },
    [filters, debouncedSearch, postedAfterDate],
  );

  // Initial / filter-change fetch — reset list
  const fetchFirstPage = useCallback(async () => {
    setLoading(true);
    setPage(1);
    try {
      const res = await axios.get<PaginatedResponse<Job>>(`${API_URL}/jobs`, {
        params: buildParams(1),
      });
      setJobs(res.data.data);
      setTotal(res.data.total);
      setHasMore(res.data.data.length === JOBS_PER_PAGE && res.data.totalPages > 1);
    } catch {
      setJobs([]);
      setTotal(0);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  // Load next page — append results
  const fetchNextPage = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    const nextPage = page + 1;
    setLoadingMore(true);
    try {
      const res = await axios.get<PaginatedResponse<Job>>(`${API_URL}/jobs`, {
        params: buildParams(nextPage),
      });
      setJobs((prev) => [...prev, ...res.data.data]);
      setPage(nextPage);
      setHasMore(
        res.data.data.length === JOBS_PER_PAGE && nextPage < res.data.totalPages,
      );
    } catch {
      // keep existing results on error
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, page, buildParams]);

  // Re-fetch from page 1 whenever filters change
  useEffect(() => {
    if (prevFilterKey.current !== filterKey) {
      prevFilterKey.current = filterKey;
    }
    fetchFirstPage();
  }, [filterKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const { sentinelRef } = useInfiniteScroll({
    onLoadMore: fetchNextPage,
    hasMore,
    isLoading: loadingMore,
    rootMargin: 200,
  });

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
              {total} job{total !== 1 ? "s" : ""} found
            </p>
          )}

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <JobCardSkeleton key={i} />
              ))}
            </div>
          ) : jobs.length > 0 ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {jobs.map((job) => (
                  <JobCard key={job.id} job={job} />
                ))}
              </div>

              {/* Sentinel element — IntersectionObserver watches this */}
              <div ref={sentinelRef} aria-hidden="true" />

              {/* Loading spinner while fetching next page */}
              {loadingMore && (
                <div className="flex justify-center py-6">
                  <Loader2
                    className="animate-spin text-stellar-blue"
                    size={28}
                    aria-label="Loading more jobs"
                  />
                </div>
              )}

              {/* End-of-results message */}
              {!hasMore && !loadingMore && (
                <p className="text-center text-sm text-theme-text py-6">
                  You&apos;ve reached the end — {total} job{total !== 1 ? "s" : ""} shown.
                </p>
              )}

              {/* Accessible "Load more" fallback button */}
              {hasMore && !loadingMore && (
                <div className="flex justify-center pt-4 pb-2">
                  <button
                    onClick={fetchNextPage}
                    className="btn-secondary px-6 py-2 text-sm"
                    aria-label="Load more jobs"
                  >
                    Load more
                  </button>
                </div>
              )}
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
