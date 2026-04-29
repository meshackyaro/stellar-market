"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Clock, DollarSign, Users } from "lucide-react";
import StatusBadge from "./StatusBadge";
import EscrowStatusBadge from "./EscrowStatusBadge";
import Skeleton from "./Skeleton";
import { Job } from "@/types";
import { useAuth } from "@/context/AuthContext";

interface JobCardProps {
  job: Job;
}

export default function JobCard({ job }: JobCardProps) {
  const { user } = useAuth();
  const [imageLoading, setImageLoading] = useState(true);
  const isFreelancer = user?.role === "FREELANCER";
  const isClient = user?.role === "CLIENT";
  const isOwnJob = user?.id === job.client.id;

  return (
    <div className="card hover:border-stellar-blue/50 transition-all duration-200 cursor-pointer">
      <Link href={`/jobs/${job.id}`} className="block">
        {job.imageUrl && (
          <div className="relative w-full h-48 mb-4 rounded-lg overflow-hidden">
            {imageLoading && (
              <Skeleton className="absolute inset-0 w-full h-full" />
            )}
            <Image
              src={job.imageUrl}
              alt={job.title}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
              onLoad={() => setImageLoading(false)}
            />
          </div>
        )}

        <div className="flex items-start justify-between mb-3">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-stellar-purple bg-stellar-purple/10 px-2 py-1 rounded w-fit">
              {job.category}
            </span>
            {isClient && isOwnJob && (
              <EscrowStatusBadge status={job.escrowStatus} />
            )}
          </div>
          <StatusBadge status={job.status} />
        </div>

        <h3 className="text-lg font-semibold text-theme-heading mb-2">
          {job.title}
        </h3>

        <p className="text-sm text-theme-text mb-4 line-clamp-2">
          {job.description}
        </p>

        <div className="flex items-center gap-4 text-sm text-theme-text">
          <div className="flex items-center gap-1">
            <DollarSign size={14} />
            <span>{job.budget.toLocaleString()} XLM</span>
          </div>
          <div className="flex items-center gap-1">
            <Users size={14} />
            <span>{job._count?.applications || 0} applicants</span>
          </div>
          <div className="flex items-center gap-1">
            <Clock size={14} />
            <span>{new Date(job.createdAt).toLocaleDateString()}</span>
          </div>
        </div>
      </Link>

      <div className="flex items-center justify-between mt-4 pt-4 border-t border-theme-border">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-gradient-to-br from-stellar-blue to-stellar-purple" />
          <span className="text-sm text-theme-text">{job.client.username}</span>
        </div>

        {/* Freelancers see Apply on open jobs they don't own */}
        {isFreelancer && job.status === "OPEN" && !isOwnJob && (
          <Link
            href={`/jobs/${job.id}`}
            className="text-xs font-medium px-3 py-1 bg-stellar-blue/10 text-stellar-blue rounded-full hover:bg-stellar-blue/20 transition-colors"
          >
            Apply
          </Link>
        )}

        {/* Clients see View Applicants on their own jobs */}
        {isClient && isOwnJob && (
          <Link
            href={`/jobs/${job.id}`}
            className="text-xs font-medium px-3 py-1 bg-stellar-purple/10 text-stellar-purple rounded-full hover:bg-stellar-purple/20 transition-colors"
          >
            View Applicants
          </Link>
        )}
      </div>
    </div>
  );
}
