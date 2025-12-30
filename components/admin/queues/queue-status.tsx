"use client"

interface QueueStatusProps {
  workerRunning: boolean
  isPaused: boolean
  redisConnected: boolean
}

export function QueueStatus({
  workerRunning,
  isPaused,
  redisConnected,
}: QueueStatusProps) {
  const getOverallStatus = () => {
    if (!redisConnected) {
      return {
        color: "bg-red-500",
        textColor: "text-red-400",
        text: "Disconnected",
        description: "Redis connection failed",
      }
    }
    if (!workerRunning) {
      return {
        color: "bg-yellow-500",
        textColor: "text-yellow-400",
        text: "Worker Stopped",
        description: "Queue worker is not running",
      }
    }
    if (isPaused) {
      return {
        color: "bg-yellow-500",
        textColor: "text-yellow-400",
        text: "Paused",
        description: "Queue is paused - no jobs will be processed",
      }
    }
    return {
      color: "bg-green-500",
      textColor: "text-green-400",
      text: "Active",
      description: "Worker is processing jobs",
    }
  }

  const status = getOverallStatus()

  return (
    <div
      className="mb-6 bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-4"
      data-testid="queue-status"
    >
      <div className="flex items-center gap-4">
        {/* Status Indicator */}
        <div className="relative flex-shrink-0">
          <div className={`w-4 h-4 rounded-full ${status.color}`} />
          {workerRunning && !isPaused && redisConnected && (
            <div
              className={`absolute inset-0 w-4 h-4 rounded-full ${status.color} animate-ping opacity-75`}
            />
          )}
        </div>

        {/* Status Text */}
        <div className="flex-1">
          <span className={`font-medium ${status.textColor}`}>{status.text}</span>
          <span className="text-sm text-slate-400 ml-2">{status.description}</span>
        </div>

        {/* Individual Status Indicators */}
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <div
              className={`w-2 h-2 rounded-full ${
                redisConnected ? "bg-green-500" : "bg-red-500"
              }`}
            />
            <span className="text-slate-400">Redis</span>
          </div>
          <div className="flex items-center gap-2">
            <div
              className={`w-2 h-2 rounded-full ${
                workerRunning ? "bg-green-500" : "bg-red-500"
              }`}
            />
            <span className="text-slate-400">Worker</span>
          </div>
          <div className="flex items-center gap-2">
            <div
              className={`w-2 h-2 rounded-full ${
                !isPaused ? "bg-green-500" : "bg-yellow-500"
              }`}
            />
            <span className="text-slate-400">Processing</span>
          </div>
        </div>
      </div>
    </div>
  )
}
