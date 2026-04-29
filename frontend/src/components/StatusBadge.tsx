const statusColors: Record<string, string> = {
  OPEN: "bg-theme-success/20 text-theme-success border-theme-success/30",
  IN_PROGRESS: "bg-theme-info/20 text-theme-info border-theme-info/30",
  COMPLETED: "bg-stellar-purple/20 text-stellar-purple border-stellar-purple/30",
  CANCELLED: "bg-theme-error/20 text-theme-error border-theme-error/30",
  DISPUTED: "bg-theme-warning/20 text-theme-warning border-theme-warning/30",
  PENDING: "bg-theme-warning/20 text-theme-warning border-theme-warning/30",
  SUBMITTED: "bg-theme-info/20 text-theme-info border-theme-info/30",
  APPROVED: "bg-theme-success/20 text-theme-success border-theme-success/30",
  REJECTED: "bg-theme-error/20 text-theme-error border-theme-error/30",
  ACCEPTED: "bg-theme-success/20 text-theme-success border-theme-success/30",
  PARTIALLY_PAID: "bg-amber-500/20 text-amber-500 border-amber-500/30",
};

interface StatusBadgeProps {
  status: string;
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  const colors = statusColors[status] || "bg-gray-500/20 text-gray-400 border-gray-500/30";

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${colors}`}
    >
      {status.replaceAll("_", " ")}
    </span>
  );
}
