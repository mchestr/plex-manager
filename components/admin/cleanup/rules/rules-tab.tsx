import { SourceLine } from "@/components/admin/cleanup/page/source-line"
import { BatchAlert } from "@/components/admin/cleanup/rules/batch-alert"
import { FirstUse } from "@/components/admin/cleanup/rules/first-use"
import { RuleCard } from "@/components/admin/cleanup/rules/rule-card"
import { StatTiles } from "@/components/admin/cleanup/rules/stat-tiles"
import type { CleanupOverviewData } from "@/lib/cleanup/types/screens"
import { getFormatSettings } from "@/lib/settings/app-settings"
import { dayKey } from "@/lib/utils/zoned-time"

/** "3 rules. A title that two rules match is in Leaving soon once, with the longer grace period." (UX 8.2) */
export function rulesLine(count: number): string {
  return `${count} ${count === 1 ? "rule" : "rules"}. A title that two rules match is in Leaving soon once, with the longer grace period.`
}

/**
 * The Rules tab of Media cleanup (UX 4.1, plan 2.3). With no rule it is the
 * first-use state: the steps, the library tiles and the recipe gallery.
 * Else it shows the batch alert while a batch waits, the four stat tiles,
 * and the rule cards, rules with a waiting batch first (the loader sorts
 * them), under the "Rules" heading with the source line.
 *
 * A Server Component: it reads the clock of its render (the page called
 * `connection()`), so "today" in its lines is the server's today in the
 * app zone, and the browser shows the same words.
 */
export async function RulesTab({ data }: { data: CleanupOverviewData }) {
  const { timeZone } = await getFormatSettings()
  // One clock for the tab: the page renders per request, after `connection()`
  const now = new Date().getTime()
  if (data.rules.length === 0) return <FirstUse data={data} now={now} />
  const today = dayKey(now, timeZone)
  const { feature } = data
  return (
    <div className="flex flex-col gap-6">
      <BatchAlert batches={data.batches} today={today} />
      <StatTiles stats={data.stats} library={data.library} today={today} />
      <section aria-labelledby="admin-cleanup-rules-heading" className="flex flex-col gap-4">
        <div className="flex flex-col gap-x-6 gap-y-2 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-col gap-1">
            <h2 id="admin-cleanup-rules-heading" className="text-h2 text-foreground">
              Rules
            </h2>
            <p className="text-ui text-muted-foreground">{rulesLine(data.rules.length)}</p>
          </div>
          <SourceLine sources={data.sources} snapshot={data.snapshot} redis={feature.redis} now={now} refresh={false} />
        </div>
        <ul className="flex flex-col gap-4" data-testid="admin-cleanup-rules">
          {data.rules.map((card) => (
            <li key={card.id}>
              <RuleCard card={card} redis={feature.redis} today={today} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
