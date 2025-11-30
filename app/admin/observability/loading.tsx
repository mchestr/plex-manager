export default function ObservabilityLoading() {
  return (
    <div className="p-4 sm:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header skeleton */}
        <div className="mb-6">
          <div className="h-8 w-48 bg-slate-700 rounded animate-pulse mb-2" />
          <div className="h-4 w-96 bg-slate-800 rounded animate-pulse" />
        </div>

        {/* Summary Stats skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="bg-slate-800/50 border border-slate-700 rounded-lg p-4"
            >
              <div className="h-4 w-24 bg-slate-700 rounded animate-pulse mb-2" />
              <div className="h-8 w-16 bg-slate-700 rounded animate-pulse mb-1" />
              <div className="h-3 w-32 bg-slate-800 rounded animate-pulse" />
            </div>
          ))}
        </div>

        {/* Service Status Grid skeleton */}
        <div className="bg-slate-800/30 border border-slate-700 rounded-lg p-4 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="h-5 w-32 bg-slate-700 rounded animate-pulse" />
            <div className="h-4 w-24 bg-slate-800 rounded animate-pulse" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
            {[...Array(7)].map((_, i) => (
              <div
                key={i}
                className="bg-slate-800/50 border border-slate-700 rounded-lg p-4"
              >
                <div className="flex items-center gap-3">
                  <div className="w-5 h-5 bg-slate-700 rounded animate-pulse" />
                  <div className="flex-1">
                    <div className="h-4 w-16 bg-slate-700 rounded animate-pulse mb-1" />
                    <div className="h-3 w-20 bg-slate-800 rounded animate-pulse" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Secondary Stats skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="bg-slate-800/50 border border-slate-700 rounded-lg p-4"
            >
              <div className="h-4 w-24 bg-slate-700 rounded animate-pulse mb-2" />
              <div className="h-6 w-20 bg-slate-700 rounded animate-pulse mb-1" />
              <div className="h-3 w-28 bg-slate-800 rounded animate-pulse" />
            </div>
          ))}
        </div>

        {/* Quick Links skeleton */}
        <div className="mb-6">
          <div className="h-5 w-28 bg-slate-700 rounded animate-pulse mb-4" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div
                key={i}
                className="bg-slate-800/50 border border-slate-700 rounded-lg p-4"
              >
                <div className="flex items-start gap-3">
                  <div className="w-5 h-5 bg-slate-700 rounded animate-pulse" />
                  <div className="flex-1">
                    <div className="h-4 w-28 bg-slate-700 rounded animate-pulse mb-2" />
                    <div className="h-3 w-40 bg-slate-800 rounded animate-pulse" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
