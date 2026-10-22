import { StatusBadge } from "@/components/ui/status-badge"
import type { RewindRowState } from "@/lib/admin/can-regenerate"
import { resolveStatus } from "@/lib/ui/status"

/** The rewind-domain word for a row; "Stuck" is a run past the 15-minute rule. */
function statusOf(state: RewindRowState) {
  if (state === "stuck") return { tone: "warning" as const, label: "Stuck" }
  const { tone, label } = resolveStatus("rewind", state)
  return { tone, label }
}

/** A Rewind year's state as a badge, optionally prefixed ("Rewind 2026: Generating"). */
export function RewindStateBadge({ state, prefix, "data-testid": testId }: { state: RewindRowState; prefix?: string; "data-testid"?: string }) {
  const { tone, label } = statusOf(state)
  return <StatusBadge tone={tone} label={prefix ? `${prefix}: ${label}` : label} data-testid={testId} />
}
