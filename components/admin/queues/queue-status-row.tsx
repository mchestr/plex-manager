import { StatusDot } from "@/components/ui/status-badge"
import { resolveStatus, type ResolvedStatus } from "@/lib/ui/status"

interface QueueState {
  redisConnected: boolean
  workerRunning: boolean
  /** `null` when Redis did not answer. */
  paused: boolean | null
}

/**
 * The three words of the status row. Without Redis no worker can take a job,
 * so the worker reads stopped and the queue's state is unknown; a stopped
 * worker never reads as running or processing.
 * @internal
 */
export function queueStatusItems({ redisConnected, workerRunning, paused }: QueueState): {
  id: "worker" | "redis" | "queue"
  status: ResolvedStatus
}[] {
  const queue = !redisConnected || paused === null ? "unknown" : paused ? "paused" : "running"
  return [
    { id: "worker", status: resolveStatus("worker", redisConnected && workerRunning ? "running" : "stopped") },
    { id: "redis", status: resolveStatus("redis", redisConnected ? "connected" : "unreachable") },
    { id: "queue", status: resolveStatus("queue", queue) },
  ]
}

/** Worker, Redis and queue state as dots and words (UI-08), wrapping at 390px. */
export function QueueStatusRow(props: QueueState) {
  return (
    <ul aria-label="Queue status" className="flex flex-wrap gap-x-4 gap-y-2" data-testid="queue-status">
      {queueStatusItems(props).map(({ id, status }) => (
        <li key={id}>
          <StatusDot tone={status.tone} label={status.label} data-testid={`queue-status-${id}`} />
        </li>
      ))}
    </ul>
  )
}
