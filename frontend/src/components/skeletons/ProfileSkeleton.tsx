export default function ProfileSkeleton() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 animate-pulse">
      {/* Header */}
      <div className="flex flex-col md:flex-row gap-8 items-start mb-12">
        <div className="w-32 h-32 rounded-full bg-theme-border flex-shrink-0" />
        <div className="flex-1 space-y-4">
          <div className="h-10 w-56 bg-theme-border rounded" />
          <div className="h-4 w-full max-w-lg bg-theme-border rounded" />
          <div className="h-4 w-3/4 max-w-sm bg-theme-border rounded" />
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-7 w-16 bg-theme-border rounded-full" />
            ))}
          </div>
          <div className="flex gap-6">
            <div className="h-4 w-28 bg-theme-border rounded" />
            <div className="h-4 w-32 bg-theme-border rounded" />
            <div className="h-4 w-24 bg-theme-border rounded" />
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
        <div className="space-y-6">
          <div className="card space-y-4">
            <div className="h-5 w-16 bg-theme-border rounded" />
            <div className="h-12 bg-theme-border rounded-lg" />
            <div className="h-12 bg-theme-border rounded-lg" />
          </div>
          <div className="card space-y-3">
            <div className="h-5 w-20 bg-theme-border rounded" />
            <div className="h-4 w-full bg-theme-border rounded" />
            <div className="h-4 w-full bg-theme-border rounded" />
          </div>
        </div>
        <div className="lg:col-span-2 space-y-4">
          <div className="flex gap-8 border-b border-theme-border pb-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-4 w-24 bg-theme-border rounded" />
            ))}
          </div>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card space-y-2">
              <div className="h-5 w-48 bg-theme-border rounded" />
              <div className="h-4 w-full bg-theme-border rounded" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
