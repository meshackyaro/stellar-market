export default function JobCardSkeleton() {
  return (
    <div className="card animate-pulse">
      {/* category + status badge row */}
      <div className="flex items-start justify-between mb-3">
        <div className="h-5 w-20 bg-theme-border rounded" />
        <div className="h-5 w-16 bg-theme-border rounded" />
      </div>

      {/* title */}
      <div className="h-5 w-3/4 bg-theme-border rounded mb-2" />

      {/* description lines */}
      <div className="space-y-1.5 mb-4">
        <div className="h-3.5 w-full bg-theme-border rounded" />
        <div className="h-3.5 w-5/6 bg-theme-border rounded" />
      </div>

      {/* meta row */}
      <div className="flex items-center gap-4">
        <div className="h-3.5 w-20 bg-theme-border rounded" />
        <div className="h-3.5 w-20 bg-theme-border rounded" />
        <div className="h-3.5 w-20 bg-theme-border rounded" />
      </div>

      {/* footer */}
      <div className="flex items-center justify-between mt-4 pt-4 border-t border-theme-border">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-theme-border" />
          <div className="h-3.5 w-20 bg-theme-border rounded" />
        </div>
        <div className="h-6 w-14 bg-theme-border rounded-full" />
      </div>
    </div>
  );
}
