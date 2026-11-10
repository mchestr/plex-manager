import type { ReactNode } from "react"

import { EverythingLeaving } from "@/components/leaving-soon/date-groups"
import { ForYouGrid } from "@/components/leaving-soon/for-you-grid"
import { KeepMeter } from "@/components/leaving-soon/keep-meter"
import { KeepsProvider } from "@/components/leaving-soon/keep-button"
import type { CardKeep } from "@/components/leaving-soon/leaving-card"
import { YourKeeps } from "@/components/leaving-soon/your-keeps"
import { Alert } from "@/components/ui/alert"
import { Card } from "@/components/ui/card"
import { EmptyState } from "@/components/ui/empty-state"
import type { MemberLeavingSoonData, MyKeepRow } from "@/lib/cleanup/types/member"
import { icons } from "@/lib/ui/icons"

/** The words of the page while plex.tv does not answer (UX 9.1, TS 13.3 step 1). */
export const PLEX_FAILED_WORDS = "Plex did not answer. Reload the page to try again."

interface LeavingSoonPageProps {
  data: MemberLeavingSoonData
  serverName: string
  /** The shortest grace period of the live rules, for the footer and End keep; none without a live rule. */
  graceDays?: number
}

/** The member's active Keeps by item key, so a card of a kept title shows "Kept by you". */
function keepsByItem(rows: readonly MyKeepRow[]): ReadonlyMap<string, CardKeep> {
  return new Map(rows.filter((row) => row.endedBy === undefined).map((row) => [row.item.itemKey, { keepId: row.id, until: row.until }]))
}

function lead(data: MemberLeavingSoonData, serverName: string): string {
  const leave = `These titles leave ${serverName} on the date shown.`
  return data.keeps.enabled ? `${leave} If you still want to watch one, keep it. A kept title stays for ${data.keeps.days} days.` : leave
}

function footer(days: number, graceDays: number | undefined): string {
  const back = graceDays ? `a new date at least ${graceDays} ${graceDays === 1 ? "day" : "days"} away` : "a new date after a full grace period"
  return `A Keep lasts ${days} days. After that, a title can come back to this list with ${back}. The server admin can end a Keep. You see that here.`
}

/** The page frame: the width of Home, with the title on the left and the meter on the right from `md`. */
function Frame({ intro, meter, children }: { intro?: string; meter?: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-280 flex-col gap-10 px-4 pt-6 pb-10 sm:px-6 md:pt-10 md:pb-14 lg:px-8" data-testid="leaving-soon-page">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between md:gap-8">
        <div className="flex max-w-160 flex-col gap-2">
          <h1 className="text-h1 text-foreground" data-testid="leaving-soon-heading">
            Leaving soon
          </h1>
          {intro && <p className="text-body text-muted-foreground">{intro}</p>}
        </div>
        {meter}
      </header>
      {children}
    </div>
  )
}

/**
 * The member's Leaving soon page (UX 9.2, TS 13.3): the lead, the Keep meter,
 * For you, everything else by leave date, Your Keeps and the footer note.
 * Without content it shows the empty state, and while plex.tv does not
 * answer the warning instead (UX 9.1). Your Keeps shows in both while the
 * member holds a Keep: each one still protects its title (TS E30). Nothing
 * on it names a size, a rule or another member.
 */
export function LeavingSoonPage({ data, serverName, graceDays }: LeavingSoonPageProps) {
  const listed = data.myKeeps.some((row) => row.endedBy !== "self")
  const yourKeeps = (data.keeps.enabled || listed) && <YourKeeps rows={data.myKeeps} serverName={serverName} />
  const content = data.enabled && data.forYou.length + data.groups.length > 0

  if (!content) {
    return (
      <KeepsProvider keeps={data.keeps} graceDays={graceDays}>
        <Frame>
          {data.plexFailed ? (
            <Alert tone="warning" data-testid="leaving-soon-plex-failed">
              {PLEX_FAILED_WORDS}
            </Alert>
          ) : (
            <Card>
              <EmptyState
                kind="first-use"
                icon={icons.leavingSoon}
                title="Nothing is leaving soon"
                description={`Titles that leave ${serverName} show here before they go.`}
                data-testid="leaving-soon-empty"
              />
            </Card>
          )}
          {listed && yourKeeps}
        </Frame>
      </KeepsProvider>
    )
  }

  const keeps = keepsByItem(data.myKeeps)
  return (
    <KeepsProvider keeps={data.keeps} graceDays={graceDays}>
      <Frame intro={lead(data, serverName)} meter={<KeepMeter />}>
        <ForYouGrid items={data.forYou} keeps={keeps} />
        <EverythingLeaving groups={data.groups} afterForYou={data.forYou.length > 0} keeps={keeps} />
        {yourKeeps}
        <p className="text-label text-muted-foreground" data-testid="leaving-soon-footer">
          {footer(data.keeps.days, graceDays)}
        </p>
      </Frame>
    </KeepsProvider>
  )
}
