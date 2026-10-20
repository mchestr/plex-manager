import { RewindCard } from "@/components/dashboard/rewind-card"
import type { RewindArchiveYear, RewindCardState, SoundtrackGeometry } from "@/lib/rewind/home-card-state"
import { soundtrack, yearDays } from "@/lib/rewind/viz/soundtrack"

import { Specimen } from "./specimen"

const SETTINGS = { timeZone: "America/Chicago", locale: "en-US" }
const NAME = "Northfield Plex Rewind 2026"

/** A year that has reached 30 November: evenings, heavier weekends and a December gap. */
function sampleSoundtrack(): SoundtrackGeometry {
  const minutes = Array.from({ length: 334 }, (_, day) => Math.round(60 + 50 * Math.sin(day / 9) + (day % 7 >= 5 ? 90 : 0) + (day % 13) * 4))
  const strip = soundtrack(minutes, { variant: "weekly", window: { from: "2026-01-01", days: yearDays("2026-01-01") }, width: 480, height: 80 })
  return { d: strip.d, centre: strip.centre, dotted: strip.dotted, width: 480, height: 80 }
}

const strip = sampleSoundtrack()
const ready = {
  kind: "ready",
  year: 2026,
  pages: 18,
  readMs: 140_140,
  edition: "full",
  ink: "ultramarine",
  soundtrack: strip,
  share: { state: "off" },
  canShare: true,
  unread: true,
  dataThrough: "Data through November 30",
} as const satisfies RewindCardState

/** The eight states of ui-design-system 5.5, as `components.html` draws them. */
const STATES: Array<{ label: string; state: RewindCardState; archive: RewindArchiveYear[] }> = [
  {
    label: "ready",
    state: ready,
    archive: [
      { year: 2025, ink: "marigold", status: "watched" },
      { year: 2024, ink: "paper", status: "watched" },
    ],
  },
  {
    label: "ready-shared",
    state: { ...ready, ink: "coral", unread: false, share: { state: "on", pages: 5, expiresOn: new Date("2027-01-31T12:00:00Z") } },
    archive: [],
  },
  { label: "generating", state: { kind: "generating", year: 2026 }, archive: [] },
  { label: "failed", state: { kind: "failed", year: 2026, code: "UPSTREAM_ERROR" }, archive: [] },
  {
    label: "before-season",
    state: { kind: "before-season", year: 2026, opensOn: new Date("2026-12-01T06:00:00Z"), lastYear: 2025 },
    archive: [],
  },
  { label: "not-eligible", state: { kind: "not-eligible", reason: "jellyfin-only" }, archive: [] },
  {
    label: "closed",
    state: { kind: "closed", year: 2026, closedOn: new Date("2027-02-01T06:00:00Z"), ink: "forest", soundtrack: strip },
    archive: [],
  },
  { label: "not-started", state: { kind: "not-started", year: 2026 }, archive: [] },
  { label: "unavailable", state: { kind: "unavailable", year: 2026, viewerIsAdmin: true, code: "REDIS_NOT_CONFIGURED" }, archive: [] },
]

/** The home RewindCard in every state (P6.9), still: no view-transition name and no polling. */
export function RewindCardSpecimen() {
  return (
    <Specimen id="rewind-card" title="RewindCard">
      <div className="grid gap-6 md:grid-cols-2">
        {STATES.map(({ label, state, archive }) => (
          <div key={label} className="flex flex-col gap-2" data-testid={`dev-ui-rewind-card-${label}`}>
            <p className="text-label text-muted-foreground">{label}</p>
            <RewindCard state={state} archive={archive} name={NAME} settings={SETTINGS} specimen />
          </div>
        ))}
      </div>
    </Specimen>
  )
}
