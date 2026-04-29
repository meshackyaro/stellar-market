"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  limit: number;
  onPageChange: (page: number) => void;
}

export default function Pagination({ page, totalPages, total, limit, onPageChange }: PaginationProps) {
  const start = (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);

  if (total === 0) return null;

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-8">
      <p className="text-sm text-theme-text">
        Showing {start}–{end} of {total} results
      </p>
      <div className="flex items-center gap-2">
        <button
          onClick={() => {
            if (page > 1) {
              onPageChange(page - 1);
            }
          }}
          disabled={page <= 1}
          className="p-2 rounded-lg border border-theme-border text-theme-text hover:border-stellar-blue disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft size={18} />
        </button>
        <span className="text-sm text-theme-heading px-3">
          Page {page} of {totalPages}
        </span>
        <button
          onClick={() => {
            if (page < totalPages) {
              onPageChange(page + 1);
            }
          }}
          disabled={page >= totalPages}
          className="p-2 rounded-lg border border-theme-border text-theme-text hover:border-stellar-blue disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronRight size={18} />
        </button>
      </div>
    </div>
  );
}
