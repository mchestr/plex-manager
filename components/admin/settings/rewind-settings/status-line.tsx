import { StatusBadge } from "@/components/ui/status-badge"

export interface RewindSettingsStatus {
  /** `checkRewindInfra()`: null when Redis answers, else the admin message. */
  redis: string | null
  /** Whether Tautulli listed its libraries just now. */
  tautulli: "connected" | "not-configured" | "unreachable"
}

const TAUTULLI = {
  connected: { tone: "success", label: "Tautulli connected" },
  "not-configured": { tone: "warning", label: "Tautulli not configured" },
  unreachable: { tone: "warning", label: "Tautulli did not answer" },
} as const

/** The section's status line: the Redis and Tautulli checks Rewind needs (design 10.4). */
export function RewindSettingsStatusLine({ status }: { status: RewindSettingsStatus }) {
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="rewind-settings-status">
      {status.redis ? (
        <StatusBadge tone="warning" label={status.redis} />
      ) : (
        <StatusBadge tone="success" label="Redis ready" />
      )}
      <StatusBadge tone={TAUTULLI[status.tautulli].tone} label={TAUTULLI[status.tautulli].label} />
    </div>
  )
}
