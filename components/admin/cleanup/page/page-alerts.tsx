"use client"

import Link from "next/link"
import type { Route } from "next"
import { useEffect, useRef, useState, type ReactNode } from "react"

import { ResumeButton } from "@/components/admin/cleanup/page/pause-resume-dialogs"
import { RefreshDataButton } from "@/components/admin/cleanup/page/refresh-data-button"
import { readTimeText } from "@/components/admin/cleanup/preview/read-time"
import { Alert } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { cleanup, settingsSection } from "@/lib/admin/routes"
import { type Block, COUNTED_WORDS, NO_OWNER_ERROR_CODE } from "@/lib/cleanup/blocks"
import { KOMETA_DOC_URL, TAUTULLI_STALE_DAYS } from "@/lib/cleanup/constants"
import { SERVICE_NAMES } from "@/lib/cleanup/fields/words"
import type { CleanupFeatureState, CleanupOverviewData } from "@/lib/cleanup/types/screens"
import { useFormat } from "@/lib/format-context"
import { icons } from "@/lib/ui/icons"
import type { BoundFormat } from "@/lib/utils/format"
import type { Service } from "@/lib/validations/cleanup-vocabulary"

/** At most this many alerts show; the rest fold (UX 4.1.4). */
export const VISIBLE_ALERTS = 3

const TONE_ORDER = { destructive: 0, warning: 1, info: 2 } as const

/** UX 8.2 and 4.1.4. */
export const OFF_WORDS = {
  title: "Media cleanup is off",
  body: "Make rules and preview them now. A rule starts in Dry run: it records its matches and changes nothing. Members see nothing until you turn cleanup on in Settings and turn a rule on.",
} as const

/** The action button of an alert. */
type AlertAction = { type: "refresh" } | { type: "resume" } | { type: "kometa" } | { type: "link"; href: Route; label: string }

interface PageAlert {
  /** The id part: `admin-cleanup-alert-{kind}`. */
  kind: string
  tone: keyof typeof TONE_ORDER
  title: string
  body: string
  action: AlertAction
  /** `admin-cleanup-alert-{kind}-action`, unless UX 10.2 names its own id. */
  actionId?: string
  icon?: ReactNode
}

interface Context {
  f: BoundFormat
  now: number
  redis: boolean
  reading: boolean
}

const REFRESH: AlertAction = { type: "refresh" }
const link = (href: Route, label: string): AlertAction => ({ type: "link", href, label })
const OFF_SETTINGS = link(cleanup({ tab: "settings", section: "cleanup-feature" }), "Open settings")

/** The action button of one alert, with its own id: `Alert` renders it outside the alert's own element. */
function AlertActionButton({ action, ctx, testId }: { action: AlertAction; ctx: Pick<Context, "now" | "redis" | "reading">; testId: string }) {
  switch (action.type) {
    case "refresh":
      return <RefreshDataButton redis={ctx.redis} reading={ctx.reading} variant="outline" data-testid={testId} />
    case "resume":
      return <ResumeButton now={ctx.now} variant="outline" size="sm" data-testid={testId} />
    case "kometa":
      return (
        <Button
          variant="outline"
          size="sm"
          nativeButton={false}
          render={<a href={KOMETA_DOC_URL} target="_blank" rel="noopener noreferrer" aria-label="Read the Kometa note, opens in a new tab" />}
          data-testid={testId}
        >
          Read the Kometa note
        </Button>
      )
    case "link":
      return (
        <Button variant="outline" size="sm" nativeButton={false} render={<Link href={action.href} />} data-testid={testId}>
          {action.label}
        </Button>
      )
  }
}

/** "at 12:00 AM" today, else "on Nov 3, 2026, 12:00 AM". */
const at = (ctx: Context, iso: string) => (ctx.f.date(iso) === ctx.f.date(ctx.now) ? `at ${ctx.f.time(iso)}` : `on ${ctx.f.dateTime(iso)}`)

/** The safety stops of the snapshot: one alert per service and kind, so every id stays unique (UX 10.1 item 7). */
function blockAlerts(blocks: readonly Block[], ctx: Context): PageAlert[] {
  const alerts: PageAlert[] = []
  const seen = new Set<string>()
  const add = (alert: PageAlert) => {
    if (seen.has(alert.kind)) return
    seen.add(alert.kind)
    alerts.push(alert)
  }
  for (const block of blocks) {
    const service: Service = block.service ?? "plex"
    const name = SERVICE_NAMES[service]
    if (block.code === "sourceFailed" && block.errorCode === NO_OWNER_ERROR_CODE) {
      add({ kind: "plex-owner", tone: "destructive", title: "Plex has no owner account for this server",
        body: "Reconnect Plex in Settings. Until then, access is unknown, and runs of every rule change nothing.", action: link(settingsSection("plex"), "Open settings") })
    } else if (block.code === "sourceFailed") {
      add({ kind: `source-${service}`, tone: "destructive", title: block.readAt ? `${name} did not answer ${at(ctx, block.readAt)}` : `${name} did not answer`,
        body: `Runs change nothing until ${name} answers. Unknown values never match.`, action: REFRESH })
    } else if (block.code === "sourceShrank") {
      const counted = blocks.filter((other) => other.code === "sourceShrank" && (other.service ?? "plex") === service)
        .map((other) => `${ctx.f.number(other.rows ?? 0)}${other.counter ? ` ${COUNTED_WORDS[other.counter]}` : ""}, ${ctx.f.number(other.previousRows ?? 0)} before`)
      add({ kind: `shrank-${service}`, tone: "destructive", title: `Safety stop: ${name} returned ${counted.join(", and ")}`,
        body: `Runs of the rules that use ${name} change nothing. If you expect this, press Refresh data now: a read that you start and that agrees clears this stop. The nightly read does not clear it.`,
        action: REFRESH })
    } else if (block.code === "tautulliStale") {
      add({ kind: "tautulli-stale", tone: "destructive", title: `Tautulli recorded no play in ${TAUTULLI_STALE_DAYS} days`,
        body: "Runs of the rules that use Tautulli change nothing until it records a play.", action: REFRESH })
    } else if (block.code === "dataStale") {
      add({ kind: "stale", tone: "warning", title: block.hours === undefined ? "Library data is too old" : `Library data is ${block.hours} hours old`,
        body: "The nightly read did not finish. Runs change nothing until a fresh read.", action: REFRESH })
    }
  }
  return alerts
}

function pausedAlert(feature: CleanupFeatureState, pausedAt: string, ctx: Context): PageAlert {
  const by = feature.pausedBy ? `, by ${feature.pausedBy.isYou ? "you" : feature.pausedBy.name}` : ""
  return {
    kind: "paused", tone: "warning", title: "Cleanup is paused", actionId: "admin-cleanup-alert-paused-resume",
    icon: <Icon icon={icons.paused} className="mt-0.5 text-warning" />,
    body: `Since ${readTimeText(ctx.f, pausedAt, ctx.now)}${by}. No run changes anything, and nothing is deleted. A deletion that started before the pause ` +
      "finishes. Approved batches went back to waiting for your approval. The Leaving soon collections are empty and members do not see the Leaving " +
      "soon page. Every Keep stays.",
    action: { type: "resume" },
  }
}

function kometaAlert(kometa: NonNullable<CleanupOverviewData["kometa"]>, ctx: Context): PageAlert {
  const again = kometa.recreatedAt ? `plex-manager made it again ${at(ctx, kometa.recreatedAt)}. ` : ""
  return {
    kind: "kometa", tone: "warning", title: `Kometa removed ${kometa.collection} ${at(ctx, kometa.removedAt)}`,
    body: `${again}Kometa removes collections that it does not manage. Change the Kometa file to stop this.`,
    action: { type: "kometa" },
  }
}

/** Every alert of the page in the order of UX 4.1.4: destructive, then warning, then info. */
function pageAlerts(props: PageAlertsProps, ctx: Context): PageAlert[] {
  const { feature, kometa, showOff = true } = props
  const alerts = blockAlerts(props.blocks, ctx)
  if (feature.pausedAt) alerts.push(pausedAlert(feature, feature.pausedAt, ctx))
  if (!feature.redis) {
    alerts.push({ kind: "redis", tone: "warning", title: "Redis is not set up",
      body: "Library reads and runs need the job queue. The preview works on the last library data.", action: link("/admin/settings", "Open settings") })
  }
  if (kometa) alerts.push(kometaAlert(kometa, ctx))
  if (!feature.enabled && showOff) {
    alerts.push({ kind: "off", tone: "info", title: OFF_WORDS.title, body: OFF_WORDS.body, actionId: "admin-cleanup-alert-off-settings",
      action: OFF_SETTINGS })
  }
  return alerts.map((alert, i) => ({ alert, i })).sort((a, b) => TONE_ORDER[a.alert.tone] - TONE_ORDER[b.alert.tone] || a.i - b.i).map(({ alert }) => alert)
}

export interface PageAlertsProps {
  feature: CleanupFeatureState
  /** The page-level stops of the newest snapshot (`pageBlocks()`). */
  blocks: readonly Block[]
  kometa?: CleanupOverviewData["kometa"]
  /** A library read holds its claim: each "Refresh data now" shows "Reading". */
  reading?: boolean
  /** The render's clock, for "today". */
  now: number
  /** False where the page shows the off alert in its own place: the first-use state (UX 4.1.1, `OffAlert`). */
  showOff?: boolean
}

/** "2 more problems. Show them". */
const moreWords = (count: number) => (count === 1 ? "1 more problem. Show it" : `${count} more problems. Show them`)

/**
 * The page-level alerts of `/admin/cleanup` (UX 4.1.4): the safety stops of
 * the library data, the pause, Redis, Kometa and the feature switch.
 * Destructive first, then warning, then info. At most three show; the rest
 * fold into "{N} more problems. Show them", which shows them and moves
 * focus to the first one it shows. Each action button has its own id,
 * because `Alert` renders it outside the alert's own element.
 */
export function PageAlerts(props: PageAlertsProps) {
  const f = useFormat()
  const [expanded, setExpanded] = useState(false)
  const firstFolded = useRef<HTMLDivElement>(null)
  const ctx: Context = { f, now: props.now, redis: props.feature.redis, reading: props.reading ?? false }
  const alerts = pageAlerts(props, ctx)

  useEffect(() => {
    if (expanded) firstFolded.current?.focus()
  }, [expanded])

  if (alerts.length === 0) return null
  const folded = alerts.length - VISIBLE_ALERTS
  const shown = expanded || folded <= 0 ? alerts : alerts.slice(0, VISIBLE_ALERTS)
  return (
    <div className="flex flex-col gap-3">
      {shown.map((alert, i) => {
        const id = `admin-cleanup-alert-${alert.kind}`
        return (
          <Alert
            key={alert.kind}
            ref={i === VISIBLE_ALERTS ? firstFolded : undefined}
            tabIndex={i === VISIBLE_ALERTS ? -1 : undefined}
            tone={alert.tone}
            title={alert.title}
            icon={alert.icon}
            action={<AlertActionButton action={alert.action} ctx={ctx} testId={alert.actionId ?? `${id}-action`} />}
            data-testid={id}
          >
            {alert.body}
          </Alert>
        )
      })}
      {folded > 0 && !expanded && (
        <Button variant="link" size="sm" className="self-start px-0" onClick={() => setExpanded(true)} data-testid="admin-cleanup-alert-more">
          {moreWords(folded)}
        </Button>
      )}
    </div>
  )
}

/** The off alert alone, for the first-use state of the Rules tab (UX 4.1.1), with the ids of UX 10.2. */
export function OffAlert() {
  return (
    <Alert
      tone="info"
      title={OFF_WORDS.title}
      action={<AlertActionButton action={OFF_SETTINGS} ctx={{ now: 0, redis: false, reading: false }} testId="admin-cleanup-alert-off-settings" />}
      data-testid="admin-cleanup-alert-off"
    >
      {OFF_WORDS.body}
    </Alert>
  )
}
