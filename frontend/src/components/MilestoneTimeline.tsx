"use client";

import { CheckCircle, Loader2, PencilLine, ShieldCheck } from "lucide-react";

import StatusBadge from "@/components/StatusBadge";
import type { Milestone } from "@/types";

type MilestoneTimelineProps = {
  milestones: Milestone[];
  isClient: boolean;
  isFreelancerOnJob: boolean;
  onSubmitMilestone: (milestoneId: string) => void;
  onApproveMilestone: (milestoneId: string) => void;
  onRequestRevision: (milestoneId: string) => void;
  actioningMilestoneId: string | null;
  recentlyApprovedMilestoneId: string | null;
  confirmingMilestoneId?: string | null;
};

function getIndicatorClasses(status: Milestone["status"], approvedPulse: boolean) {
  if (status === "APPROVED") {
    return approvedPulse
      ? "bg-theme-success border-theme-success shadow-[0_0_0_4px_rgba(34,197,94,0.18)]"
      : "bg-theme-success border-theme-success";
  }
  if (status === "SUBMITTED") {
    return "bg-theme-warning border-theme-warning";
  }
  if (status === "IN_PROGRESS") {
    return "bg-theme-info border-theme-info";
  }
  if (status === "REJECTED") {
    return "bg-theme-error border-theme-error";
  }
  return "bg-gray-500 border-gray-500";
}

export default function MilestoneTimeline({
  milestones,
  isClient,
  isFreelancerOnJob,
  onSubmitMilestone,
  onApproveMilestone,
  onRequestRevision,
  actioningMilestoneId,
  recentlyApprovedMilestoneId,
  confirmingMilestoneId,
}: MilestoneTimelineProps) {
  const completedCount = milestones.filter((m) => m.status === "APPROVED").length;
  const totalCount = milestones.length;
  const progressPct = totalCount ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center justify-between gap-3 mb-2">
          <div className="text-sm text-theme-text">
            <span className="font-semibold text-theme-heading">{completedCount}</span> of{" "}
            <span className="font-semibold text-theme-heading">{totalCount}</span> milestones completed ({progressPct}%)
          </div>
        </div>
        <div className="w-full h-2 rounded-full bg-theme-border overflow-hidden">
          <div
            className="h-full bg-stellar-blue transition-all duration-500"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      <div className="relative">
        <div className="absolute left-4 top-0 bottom-0 w-px bg-theme-border" />

        <div className="space-y-4">
          {milestones.map((milestone, index) => {
            const isActioning = actioningMilestoneId === milestone.id;
            const approvedPulse = recentlyApprovedMilestoneId === milestone.id;
            const indicatorClasses = getIndicatorClasses(milestone.status, approvedPulse);

            return (
              <div key={milestone.id} className="relative flex gap-4">
                <div className="relative z-10 flex-shrink-0 w-8 h-8">
                  <div
                    className={`w-8 h-8 rounded-full border flex items-center justify-center text-xs font-semibold text-white transition-colors duration-500 ${indicatorClasses}`}
                  >
                    {milestone.status === "APPROVED" ? (
                      <CheckCircle className="text-white" size={18} />
                    ) : (
                      index + 1
                    )}
                  </div>
                </div>

                <div
                  className={`flex-1 p-4 rounded-lg border bg-theme-bg transition-colors duration-500 ${
                    milestone.status === "APPROVED"
                      ? "border-theme-success/30"
                      : "border-theme-border"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-medium text-theme-heading">{milestone.title}</div>
                      <div className="text-xs text-theme-text mt-1">
                        {milestone.amount.toLocaleString()} XLM
                      </div>
                    </div>
                    <StatusBadge status={milestone.status} />
                  </div>

                  <p className="text-sm text-theme-text mt-3">{milestone.description}</p>
                  {confirmingMilestoneId === milestone.id && (
                    <p className="text-xs text-stellar-blue mt-2">
                      Confirming on-chain...
                    </p>
                  )}

                  <div className="mt-4 flex flex-wrap gap-2">
                    {isFreelancerOnJob && milestone.status === "IN_PROGRESS" && (
                      <button
                        type="button"
                        disabled={isActioning}
                        onClick={() => onSubmitMilestone(milestone.id)}
                        className="btn-primary py-1.5 text-xs flex items-center gap-2"
                      >
                        {isActioning ? (
                          <Loader2 className="animate-spin" size={14} />
                        ) : (
                          <CheckCircle size={14} />
                        )}
                        Submit Milestone
                      </button>
                    )}

                    {isClient && milestone.status === "SUBMITTED" && (
                      <>
                        <button
                          type="button"
                          disabled={isActioning}
                          onClick={() => onApproveMilestone(milestone.id)}
                          className="btn-primary py-1.5 text-xs flex items-center gap-2"
                        >
                          {isActioning ? (
                            <Loader2 className="animate-spin" size={14} />
                          ) : (
                            <ShieldCheck size={14} />
                          )}
                          Approve
                        </button>
                        <button
                          type="button"
                          disabled={isActioning}
                          onClick={() => onRequestRevision(milestone.id)}
                          className="btn-secondary py-1.5 text-xs flex items-center gap-2"
                        >
                          <PencilLine size={14} /> Request Revision
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
