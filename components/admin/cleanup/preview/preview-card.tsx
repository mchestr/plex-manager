"use client"

import type { ClauseLabel } from "@/components/admin/cleanup/preview/clause-labels"
import { ConditionStats } from "@/components/admin/cleanup/preview/condition-stats"
import { LargestMatches } from "@/components/admin/cleanup/preview/largest-matches"
import { PreviewWarnings, type PreviewRefresh } from "@/components/admin/cleanup/preview/preview-warnings"
import { readTimeText } from "@/components/admin/cleanup/preview/read-time"
import { ResultCounts } from "@/components/admin/cleanup/preview/result-counts"
import { sizeText, spokenSize } from "@/components/admin/cleanup/preview/sizes"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { StatusDot } from "@/components/ui/status-badge"
import { nounWord, SERVICE_NAMES } from "@/lib/cleanup/fields/words"
import type { PreviewResponse } from "@/lib/cleanup/types/preview"
import { useFormat } from "@/lib/format-context"
import { icons } from "@/lib/ui/icons"
import { cn } from "@/lib/utils"
import type { BoundFormat } from "@/lib/utils/format"
import type { PreviewTab } from "@/lib/validations/cleanup-actions"

interface PreviewCardProps {
  data: PreviewResponse
  labels: readonly ClauseLabel[]
  /** The sentence of each global protection by id ("g4"), for "This rule can never match". */
  globals?: Readonly<Record<string, string>>
  /** The render's clock, for "today". */
  now: number
  /** A newer preview is on its way: the old result stays at 55 % opacity and nothing speaks (UX 4.3.9). */
  updating?: boolean
  /** The last request got a 429. */
  rateLimited?: boolean
  /** Matches now minus matches before the last edit. Null before the first edit (UX 4.3.6). */
  delta?: number | null
  refresh?: PreviewRefresh
  onWhy: (itemKey: string) => void
  onSelectTab: (tab: PreviewTab) => void
  onChangeCondition?: (conditionId: string) => void
}

/** The growth after "up to" (UX 8.4): ", about 4 weeks of growth". None without a growth rate. */
function growthTail(weeks: number | null): string {
  if (weeks === null) return ""
  if (weeks < 1) return ", less than 1 week of growth"
  return `, about ${weeks} ${weeks === 1 ? "week" : "weeks"} of growth`
}

function Sources({ data, f }: { data: PreviewResponse; f: BoundFormat }) {
  const used = data.sources.filter((source) => source.state !== "notConfigured")
  if (used.length === 0) return null
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1" aria-label="Library data sources" data-testid="admin-cleanup-preview-sources">
      {used.map((source) => {
        const shares = source.part === "shares"
        const name = shares ? "Plex shares" : SERVICE_NAMES[source.service]
        const label = source.state === "failed" ? `${name} failed` : source.readAt ? `${name} ${f.time(source.readAt)}` : name
        return (
          <li key={`${source.service}-${source.part ?? ""}`}>
            <StatusDot
              tone={source.state === "failed" ? "destructive" : "success"}
              label={label}
              className="text-label"
              data-testid={`admin-cleanup-preview-source-${source.service}${shares ? "-shares" : ""}`}
            />
          </li>
        )
      })}
    </ul>
  )
}

/**
 * The live preview of the rule editor (UX 4.3.6): an `aside` named Preview,
 * sticky from `lg` with its own scroll. It holds the head, the headline, the
 * delta, the sources, the warnings, "What each condition does", the largest
 * matches and the tab counts. The editor root owns the one preview query
 * (plan D11) and passes its result here.
 *
 * Only the settled headline speaks, in a polite region that shows from `lg`
 * (below `lg` the count bar speaks, UX 7.10). While a newer result is on its
 * way the card keeps the old one at 55 % opacity with `aria-busy`, and the
 * region does not change. Below `lg` the headline, delta, largest matches and
 * counts leave the card: the count bar and Results show them
 * (`shots/04-editor-mobile.png`).
 */
export function PreviewCard({
  data,
  labels,
  globals,
  now,
  updating = false,
  rateLimited = false,
  delta = null,
  refresh,
  onWhy,
  onSelectTab,
  onChangeCondition,
}: PreviewCardProps) {
  const f = useFormat()
  const noun = nounWord(data.matches, data.level)
  const size = sizeText(data.bytes)
  const tail = growthTail(data.growthWeeks)
  const settled = `${f.number(data.matches)} ${noun} of ${f.number(data.checked)} checked. Up to ${spokenSize(size)}${tail}.`

  return (
    <aside
      aria-label="Preview"
      aria-busy={updating || undefined}
      className="flex flex-col rounded-lg border bg-card text-card-foreground lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)] lg:overflow-y-auto"
      data-testid="admin-cleanup-preview"
    >
      <div className="flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h2 className="mr-auto text-h3 text-foreground">Preview</h2>
          {updating && (
            <span className="flex items-center gap-1.5 text-label text-muted-foreground" data-testid="admin-cleanup-preview-updating">
              <Spinner size={14} />
              Updating
            </span>
          )}
          {data.snapshot && (
            <p className="text-label text-muted-foreground max-lg:basis-full max-lg:order-last" data-testid="admin-cleanup-preview-read-timestamp">
              Library data from {readTimeText(f, data.snapshot.takenAt, now)}
            </p>
          )}
          {refresh && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Refresh data now"
              icon={<Icon icon={icons.sync} />}
              loading={refresh.pending ?? false}
              disabled={refresh.disabled}
              onClick={refresh.onRefresh}
              data-testid="admin-cleanup-preview-refresh"
            />
          )}
        </div>
        <div className={cn("flex flex-col gap-4 transition-opacity", updating && "opacity-55")}>
          {data.snapshot === null ? (
            <div className="hidden gap-6 lg:flex">
              <Skeleton className="h-10 w-24" />
              <Skeleton className="h-10 w-24" />
            </div>
          ) : (
            <>
              <div aria-hidden="true" className="hidden grid-cols-[auto_minmax(0,1fr)] gap-x-8 lg:grid">
                <div className="flex flex-col gap-0.5">
                  <p className="text-stat tabular-nums" data-testid="admin-cleanup-preview-count">
                    {f.number(data.matches)}
                  </p>
                  <p className="text-label text-muted-foreground">
                    {noun} of {f.number(data.checked)} checked
                  </p>
                </div>
                <div className="flex flex-col gap-0.5">
                  <p className="text-stat tabular-nums" data-testid="admin-cleanup-preview-bytes">
                    {size}
                  </p>
                  <p className="text-label text-muted-foreground">up to{tail}</p>
                </div>
              </div>
              <p aria-live="polite" className="sr-only hidden lg:block">
                {settled}
              </p>
            </>
          )}
          {delta !== null && delta !== 0 && (
            <Badge variant="info" className="max-lg:hidden" data-testid="admin-cleanup-preview-delta">
              {f.number(Math.abs(delta))} {delta > 0 ? "more" : "fewer"} than before your last change
            </Badge>
          )}
          <Sources data={data} f={f} />
          <PreviewWarnings
            data={data}
            labels={labels}
            globals={globals}
            rateLimited={rateLimited}
            f={f}
            onChangeCondition={onChangeCondition}
            refresh={refresh}
          />
        </div>
      </div>
      <div className={cn("flex flex-col transition-opacity", updating && "opacity-55")}>
        <div className="border-t px-5 py-4">
          {data.snapshot === null ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <ConditionStats
              clauses={data.clauses}
              labels={labels}
              checked={data.checked}
              allConditions={data.allConditions}
              matches={data.matches}
              protectedAll={data.protectedAll}
              f={f}
            />
          )}
        </div>
        {data.snapshot !== null && data.largest.length > 0 && (
          <div className="hidden border-t px-5 py-4 lg:block">
            <LargestMatches items={data.largest} onWhy={onWhy} />
          </div>
        )}
        {data.snapshot !== null && (
          <div className="hidden border-t px-5 py-4 lg:block">
            <ResultCounts tabs={data.tabs} f={f} onSelectTab={onSelectTab} />
          </div>
        )}
      </div>
    </aside>
  )
}
