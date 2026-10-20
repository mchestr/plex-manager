import { Icon } from "@/components/ui/icon"
import { StatusBadge } from "@/components/ui/status-badge"
import { icons } from "@/lib/ui/icons"
import { POSTER_PALETTE } from "@/lib/ui/poster-palette"
import { resolveStatus, settingsCategory, STATUS, type StatusDomain, type StatusValue } from "@/lib/ui/status"

import { Row, Specimen } from "./specimen"

/** The nav glyph colours of 5.6; "off" is muted. */
const NAV_TONE: Record<ReturnType<typeof settingsCategory>["tone"], string> = {
  success: "text-success",
  warning: "text-warning",
  destructive: "text-destructive",
  neutral: "text-muted-foreground",
}

// A fixed date, so the sheet's screenshots never move.
const FILL = { date: new Date("2026-11-06T12:00:00Z"), now: new Date("2026-11-06T12:04:00Z"), by: "Dana", usesLeft: 3, usesTotal: 5 }

function DomainRow<D extends StatusDomain>({ domain }: { domain: D }) {
  const values = Object.keys(STATUS[domain]) as StatusValue<D>[]
  return (
    <Row label={domain}>
      {values.map((value) => (
        <StatusBadge key={value} domain={domain} value={value} sub={resolveStatus(domain, value, FILL).sub} />
      ))}
    </Row>
  )
}

/** Every row of the 5.6 status table, with its sub-line filled from a fixed date. */
export function StatusVocabularySpecimen() {
  return (
    <Specimen id="status-vocabulary" title="Status vocabulary">
      {(Object.keys(STATUS) as StatusDomain[]).map((domain) => (
        <DomainRow key={domain} domain={domain} />
      ))}
      <Row label="Settings nav">
        {(["ok", "degraded", "unreachable", "disabled"] as const).map((status) => {
          const { category, label, tone, icon } = settingsCategory(status)
          return (
            <span key={category} className="inline-flex items-center gap-2 text-ui text-foreground">
              <Icon icon={icon} size={12} className={NAV_TONE[tone]} />
              {label}
            </span>
          )
        })}
      </Row>
    </Specimen>
  )
}

/** The 3.10 concept map from `lib/ui/icons.ts`. */
export function IconMapSpecimen() {
  return (
    <Specimen id="icon-map" title="Icon concepts">
      <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3 md:grid-cols-4">
        {Object.entries(icons).map(([concept, glyph]) => (
          <span key={concept} className="inline-flex items-center gap-2 text-ui text-muted-foreground">
            <Icon icon={glyph} />
            {concept}
          </span>
        ))}
      </div>
    </Specimen>
  )
}

/** The eight poster fallback title cards (3.11), until the Poster primitive arrives with its first consumer. */
export function PosterPaletteSpecimen() {
  return (
    <Specimen id="poster-palette" title="Poster fallback palette">
      <div className="grid grid-cols-4 gap-4 md:grid-cols-8">
        {POSTER_PALETTE.map((pair) => (
          <div
            key={pair.ink}
            data-testid={`dev-ui-poster-${pair.ink}`}
            className="flex aspect-[2/3] items-end rounded-sm p-2 shadow-poster"
            style={{ backgroundColor: pair.field, color: pair.on }}
          >
            <span className="text-ui font-semibold font-stretch-85%">{pair.ink}</span>
          </div>
        ))}
      </div>
    </Specimen>
  )
}
