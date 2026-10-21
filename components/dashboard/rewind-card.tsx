import { BookOpen, CalendarDays, CircleX, Globe, LoaderCircle, Lock, Play, Share2, type LucideIcon } from "lucide-react"
import type { Route } from "next"
import Link from "next/link"
import { ViewTransition, type ReactNode } from "react"

import { PrintingBar, RewindCardGenerating } from "@/components/dashboard/rewind-card-generating"
import { SoundtrackPrint } from "@/components/rewind/soundtrack-print"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardFooter } from "@/components/ui/card"
import { Icon } from "@/components/ui/icon"
import { inkProps, type InkName } from "@/lib/design/tokens"
import { cardCopy, issueMeta, shareLine } from "@/lib/rewind/home-card-copy"
import type { RewindArchiveYear, RewindCardKind, RewindCardState } from "@/lib/rewind/home-card-state"
import type { FormatSettings } from "@/lib/utils/format"
import { cn } from "@/lib/utils"

interface RewindCardProps {
  state: RewindCardState
  archive: RewindArchiveYear[]
  /** `rewindName(year)`: "Northfield Plex Rewind 2026". */
  name: string
  settings: FormatSettings
  /**
   * A still specimen for the `/dev/ui` sheet of every state: the strip is
   * not named `rewind-field` (one element per page may carry the name, the
   * source of the card-to-cover view transition, Rewind 4.4) and the
   * generating strip does not poll.
   */
  specimen?: boolean
}

const BADGE_ICONS: Partial<Record<RewindCardKind, { variant: "info" | "destructive" | "neutral"; icon: LucideIcon }>> = {
  generating: { variant: "info", icon: LoaderCircle },
  failed: { variant: "destructive", icon: CircleX },
  "before-season": { variant: "neutral", icon: CalendarDays },
  "not-eligible": { variant: "neutral", icon: CalendarDays },
}

const openHref = (year: number) => `/rewind/${year}?from=/` as Route

/** The strip: the only part of the card in the Rewind scope (ui-design-system 4.4). */
function Strip({ state, specimen }: { state: RewindCardState; specimen: boolean }) {
  const printed = state.kind === "ready" || state.kind === "closed"
  const ink: InkName = printed ? state.ink : "paper"
  const { className: scheme, ...field } = inkProps(ink)
  const strip = (
    <div
      data-theme="rewind"
      {...field}
      data-testid="rewind-card-strip"
      className={cn(scheme, "h-20 shrink-0 bg-background px-4 py-2.5 text-foreground md:h-28 md:px-5 md:py-3.5")}
    >
      {state.kind !== "generating" ? (
        <SoundtrackPrint soundtrack={printed ? state.soundtrack : null} />
      ) : specimen ? (
        <PrintingBar />
      ) : (
        <RewindCardGenerating year={state.year} />
      )}
    </div>
  )
  return specimen ? strip : (
    // Only the shared card-to-cover pair animates; nothing else on home starts a view transition
    <ViewTransition name="rewind-field" default="none" share="auto">
      {strip}
    </ViewTransition>
  )
}

function MetaItem({ icon, children, testId }: { icon: LucideIcon; children: ReactNode; testId: string }) {
  return (
    <span className="inline-flex items-center gap-1.5" data-testid={testId}>
      <Icon icon={icon} size={14} />
      {children}
    </span>
  )
}

function Actions({ state }: { state: RewindCardState }) {
  if (state.kind === "ready" || state.kind === "closed") {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <Button size="lg" render={<Link href={openHref(state.year)} data-testid="rewind-card-open" />}>
          <Icon icon={Play} />
          Open Rewind
        </Button>
        {state.kind === "ready" &&
          (state.canShare ? (
            <Button
              variant="secondary"
              size="lg"
              render={<Link href={`/rewind/${state.year}?sheet=share&from=/` as Route} data-testid="rewind-card-share" />}
            >
              <Icon icon={Share2} />
              {state.share.state === "on" ? "Manage sharing" : "Share"}
            </Button>
          ) : (
            <Link href="/subscribe" data-testid="rewind-card-share-lapsed" className="text-ui text-muted-foreground underline underline-offset-3">
              Sharing needs an active membership
            </Link>
          ))}
      </div>
    )
  }
  if (state.kind === "before-season" && state.lastYear !== null) {
    return (
      <div>
        <Button variant="secondary" render={<Link href={openHref(state.lastYear)} data-testid="rewind-card-open-last" />}>
          Open Rewind {state.lastYear}
        </Button>
      </div>
    )
  }
  return null
}

function Archive({ archive, dataThrough }: { archive: RewindArchiveYear[]; dataThrough: string | null }) {
  if (archive.length === 0 && !dataThrough) return null
  return (
    <CardFooter className="flex-wrap gap-x-4 gap-y-2">
      {archive.length > 0 && (
        <nav aria-label="Past years" className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="text-label text-muted-foreground">Past years</span>
          {archive.map(({ year, ink, status }) => {
            const { className: scheme, ...field } = inkProps(ink)
            return (
              <Link key={year} href={openHref(year)} data-testid={`rewind-card-archive-${year}`} className="inline-flex items-center gap-2 text-ui underline-offset-3 hover:underline">
                <span aria-hidden="true" data-theme="rewind" {...field} className={cn(scheme, "size-3 rounded-[2px] border bg-background")} />
                {year}
                <span className="sr-only">{status === "watched" ? ", watched" : ", not opened yet"}</span>
              </Link>
            )
          })}
        </nav>
      )}
      {dataThrough && (
        <span className="ml-auto text-label text-muted-foreground" data-testid="rewind-card-data-through">
          {dataThrough}
        </span>
      )}
    </CardFooter>
  )
}

/**
 * The home RewindCard (ui-design-system 5.5, Rewind 4.4): an app-theme Card
 * whose strip alone is in the Rewind scope. Ready and closed print the
 * member's weekly soundtrack in their archetype ink; every other state is
 * paper. The card never generates and never creates a share link: Share
 * opens Rewind's share sheet (FR-19, FR-20).
 */
export function RewindCard({ state, archive, name, settings, specimen = false }: RewindCardProps) {
  const copy = cardCopy(state, name, settings)
  const badge = BADGE_ICONS[state.kind]
  const ready = state.kind === "ready" ? state : null

  return (
    <Card data-testid="rewind-card" data-state={state.kind} className="overflow-hidden">
      <Strip state={state} specimen={specimen} />
      <div className="flex flex-col gap-3 px-5 py-5 md:px-6">
        {copy.badge && badge && (
          <Badge variant={badge.variant} icon={badge.icon} className={cn(state.kind === "generating" && "[&_svg]:animate-spin")}>
            {copy.badge}
          </Badge>
        )}
        <div className="flex items-center gap-2.5">
          {ready?.unread && <span role="img" aria-label="New" data-testid="rewind-card-unread" className="size-2 shrink-0 rounded-[2px] bg-primary" />}
          <h2 className="text-h2" data-testid="rewind-card-title">
            {copy.title}
          </h2>
        </div>
        <p className="text-body text-muted-foreground" data-testid="rewind-card-lead">
          {copy.lead}
        </p>
        {ready && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-ui text-muted-foreground">
            {ready.pages !== null && ready.readMs !== null && (
              <MetaItem icon={BookOpen} testId="rewind-card-meta">
                {issueMeta(ready.pages, ready.readMs, settings)}
              </MetaItem>
            )}
            <MetaItem icon={ready.share.state === "on" ? Globe : Lock} testId="rewind-card-privacy">
              {shareLine(ready, settings)}
            </MetaItem>
          </div>
        )}
        <Actions state={state} />
      </div>
      <Archive archive={archive} dataThrough={ready?.dataThrough ?? null} />
    </Card>
  )
}
