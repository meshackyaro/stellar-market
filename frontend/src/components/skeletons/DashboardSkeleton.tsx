export function DashboardStatsSkeleton() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8 animate-pulse">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="card flex items-center gap-4">
          <div className="w-6 h-6 rounded bg-theme-border shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-7 w-16 bg-theme-border rounded" />
            <div className="h-3.5 w-24 bg-theme-border rounded" />
            <div className="h-3 w-28 bg-theme-border rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function DashboardTabContentSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="card flex items-center justify-between gap-4">
          <div className="flex-1 space-y-2">
            <div className="h-4 w-48 bg-theme-border rounded" />
            <div className="h-3.5 w-64 bg-theme-border rounded" />
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <div className="h-4 w-16 bg-theme-border rounded" />
            <div className="h-6 w-20 bg-theme-border rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}
