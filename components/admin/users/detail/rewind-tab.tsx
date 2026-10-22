import { getUserRewindRows, regenerateEstimateCopy } from "@/lib/admin/user-detail-tabs"
import type { BoundFormat } from "@/lib/utils/format"

import { RewindTable, type RewindTableRow } from "./rewind-table"

const EDITION: Record<string, string> = { full: "Full", pocket: "Pocket", postcard: "Postcard" }

interface RewindTabProps {
  userId: string
  name: string
  seasonYear: number
  f: BoundFormat
  now: number
}

/** Every year of the member's Rewind, with Preview, Roll back and Regenerate (P10.6). */
export async function RewindTab({ userId, name, seasonYear, f, now }: RewindTabProps) {
  const rows = await getUserRewindRows(userId, seasonYear, now)
  const estimateCopy = rows.some((row) => row.canRegenerate) ? await regenerateEstimateCopy(seasonYear, f) : ""

  const tableRows: RewindTableRow[] = rows.map((row) => ({
    wrappedId: row.wrappedId,
    year: row.year,
    state: row.state,
    edition: row.edition ? (EDITION[row.edition] ?? row.edition) : "—",
    generated: row.generatedAt ? f.dateTime(row.generatedAt, { zoneLabel: true }) : "—",
    shared: row.shared,
    visits: f.number(row.visits),
    canRollBack: row.canRollBack,
    canRegenerate: row.canRegenerate,
    versions: row.versions.map((version) => ({ id: version.id, label: `Version of ${f.dateTime(version.createdAt, { zoneLabel: true })}` })),
  }))

  return <RewindTable userId={userId} name={name} rows={tableRows} estimateCopy={estimateCopy} />
}
