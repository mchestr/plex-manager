"use client"

interface SchedulerInfoProps {
  schedulers: Array<{
    id: string
    pattern: string
    next: Date | null
  }>
}

export function SchedulerInfo({ schedulers }: SchedulerInfoProps) {
  const formatNextRun = (next: Date | null) => {
    if (!next) return "N/A"

    const date = new Date(next)
    const now = new Date()
    const diffMs = date.getTime() - now.getTime()

    if (diffMs < 0) return "Running..."
    if (diffMs < 60000) return `in ${Math.round(diffMs / 1000)}s`
    if (diffMs < 3600000) return `in ${Math.round(diffMs / 60000)}m`
    if (diffMs < 86400000) return `in ${Math.round(diffMs / 3600000)}h`

    return date.toLocaleString()
  }

  const formatPattern = (pattern: string) => {
    // Handle BullMQ repeat patterns like "every 3600000" (ms)
    if (pattern.startsWith("every ")) {
      const ms = parseInt(pattern.replace("every ", ""), 10)
      if (!isNaN(ms)) {
        if (ms >= 3600000) return `Every ${Math.round(ms / 3600000)}h`
        if (ms >= 60000) return `Every ${Math.round(ms / 60000)}m`
        return `Every ${Math.round(ms / 1000)}s`
      }
    }
    return pattern
  }

  return (
    <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-4">
      <h3 className="text-sm font-semibold text-white mb-3">Scheduled Jobs</h3>

      {schedulers.length === 0 ? (
        <p className="text-sm text-slate-400">No scheduled jobs configured</p>
      ) : (
        <div className="space-y-2">
          {schedulers.map((scheduler) => (
            <div
              key={scheduler.id}
              className="flex items-center justify-between text-sm"
            >
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-cyan-500" />
                <span className="text-slate-300 font-mono text-xs">
                  {scheduler.id}
                </span>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-slate-400">
                  {formatPattern(scheduler.pattern)}
                </span>
                <span className="text-cyan-400">
                  {formatNextRun(scheduler.next)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
