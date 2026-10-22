import { StatTile } from "@/components/ui/stat-tile"
import type { RewindSummary } from "@/lib/admin/overview"
import type { BoundFormat } from "@/lib/utils/format"

import { Unavailable } from "./unavailable"

const TEST_ID = "admin-overview-rewind"

/**
 * Rewind: "64 of 70 ready" with a meter of the member states and how many
 * opened theirs. Outside the season: "Opens Dec 1", with last season's
 * totals as the unit.
 */
export function RewindTile({ rewind, f }: { rewind: RewindSummary | null; f: BoundFormat }) {
  if (!rewind) {
    return <StatTile label="Rewind" value={null} meta={<Unavailable />} href="/admin/rewind" data-testid={TEST_ID} />
  }

  const { year, ready, generating, failed, notStarted, members, opened } = rewind
  const readyOf = `${f.number(ready)} of ${f.number(members)} ready`
  const meter = [
    { value: ready, tone: "success" as const, label: `${f.number(ready)} ready` },
    { value: generating, tone: "info" as const, label: `${f.number(generating)} generating` },
    { value: failed, tone: "destructive" as const, label: `${f.number(failed)} failed` },
    { value: notStarted, tone: "neutral" as const, label: `${f.number(notStarted)} not started` },
  ]
  const meta = `Opened by ${f.number(opened)} ${opened === 1 ? "member" : "members"}`

  if (!rewind.isOpen) {
    return (
      <StatTile
        label={`Rewind ${year + 1}`}
        value={`Opens ${f.date(rewind.opensAt, "day-month-short")}`}
        unit={`${year}: ${readyOf}`}
        meta={`${year}: ${meta}`}
        href="/admin/rewind"
        data-testid={TEST_ID}
      />
    )
  }

  return (
    <StatTile
      label={`Rewind ${year}`}
      value={f.number(ready)}
      unit={`of ${f.number(members)} ready`}
      meta={meta}
      meter={meter}
      href="/admin/rewind"
      data-testid={TEST_ID}
    />
  )
}
