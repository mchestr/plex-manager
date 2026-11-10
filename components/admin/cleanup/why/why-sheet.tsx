"use client"

import type { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { type RefObject, useRef, useState } from "react"

import { readTimeText } from "@/components/admin/cleanup/preview/read-time"
import { WhyConditions } from "@/components/admin/cleanup/why/why-conditions"
import { type WhyActionResult, WhyFooter, itemLabel, type WhySurface } from "@/components/admin/cleanup/why/why-footer"
import { WhyProtections } from "@/components/admin/cleanup/why/why-protections"
import { WhyThen } from "@/components/admin/cleanup/why/why-then"
import { Alert } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { CONFIRM_FALLBACK_ERROR } from "@/components/ui/confirm-dialog"
import { Icon } from "@/components/ui/icon"
import { Poster } from "@/components/ui/poster"
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { StatusBadge, StatusDot } from "@/components/ui/status-badge"
import { CleanupWhyFailed, useCleanupWhy } from "@/hooks/use-cleanup-why"
import { useMediaQuery } from "@/hooks/use-media-query"
import { NOUNS, SERVICE_NAMES } from "@/lib/cleanup/fields/words"
import type { WhySheetData } from "@/lib/cleanup/types/preview"
import { useFormat } from "@/lib/format-context"
import { icons } from "@/lib/ui/icons"
import { type BoundFormat, formatBytes } from "@/lib/utils/format"
import type { RuleDraft } from "@/lib/validations/cleanup-draft"
import { LEVEL_ARR } from "@/lib/validations/cleanup-vocabulary"

export type { WhyActionResult, WhySurface } from "@/components/admin/cleanup/why/why-footer"

type TryValue = NonNullable<WhySheetData["tryValue"]>

export interface WhySheetProps {
  /** The title to explain. Null closes the Sheet. */
  itemKey: string | null
  onClose: () => void
  /** The query of `useCleanupWhy`: the rule id or "new", the saved rule, the editor's draft, or a History outcome. */
  scope: string
  ruleId?: string
  definition?: RuleDraft
  outcomeId?: string
  surface: WhySurface
  /** The title to show while the data loads. */
  title?: string
  /** The editor only: "Try" changes the draft value, then the Sheet closes (UX 4.5 item 1). */
  onTry?: (value: TryValue) => void
  /** Told after a successful Postpone or Exclude, before the Sheet closes. */
  onActionDone?: (result: WhyActionResult) => void
  /** Where focus goes when the Sheet closes (UX 7.9, architecture-r8-2). Default: back to the opener. */
  finalFocus?: DialogPrimitive.Popup.Props["finalFocus"]
}

const capital = (text: string) => `${text.charAt(0).toUpperCase()}${text.slice(1)}`
const freesSpace = (state: WhySheetData["state"]) => state === "match" || state === "leaving" || state === "deleted"

/** "Movies. 17.1 GB on disk, up to 17.1 GB freed. Added Mar 3, 2024." (UX 8.5). */
export function metaLine(data: WhySheetData, f: BoundFormat): string {
  const { item, state } = data
  const kind = capital(NOUNS[item.level][1])
  const added = data.addedAt ? ` Added ${f.date(data.addedAt)}.` : ""
  if (item.sizeBytes === null) return `${kind}. Size unknown.${added}`
  const size = formatBytes(BigInt(item.sizeBytes))
  return `${kind}. ${size} on disk${freesSpace(state) ? `, up to ${size} freed` : ""}.${added}`
}

const conditionsWord = (count: number) => (count === 1 ? "1 condition" : `${count} conditions`)

/** The summary of UX 8.5, one sentence by state. */
export function whySummary(data: WhySheetData, f: BoundFormat): string {
  const total = data.conditions.length
  switch (data.state) {
    case "match": {
      const then = data.then?.dryRun ? "This rule is in Dry run, so a run only records it." : "The next run puts it in Leaving soon."
      return `${total === 1 ? "The condition passes" : `All ${conditionsWord(total)} pass`}, and no protection applies. ${then}`
    }
    case "nearMiss":
      return `It fails ${data.conditions.filter((c) => c.verdict === "fail").length} of ${conditionsWord(total)}, so it is not a match. Nothing changes for it.`
    case "protected": {
      const by = data.protections.find((p) => p.verdict === "protects")
      return `${total === 1 ? "The condition passes" : `All ${conditionsWord(total)} pass`}, but a protection keeps it safe${by ? `: ${by.label}` : ""}.`
    }
    case "missing": {
      const unknown = data.conditions.find((c) => c.verdict === "unknown") ?? data.protections.find((p) => p.verdict === "unknown")
      return `${unknown ? unknown.label : "A value"} is unknown, so it is not a match. It keeps its current state.`
    }
    case "cannotDelete":
      return `${data.cause ?? `${SERVICE_NAMES[LEVEL_ARR[data.item.level]]} cannot delete it.`} Cleanup never deletes it.`
    case "leaving":
      return data.leaving
        ? `It joined Leaving soon on ${f.date(data.leaving.enteredAt)}. It leaves on ${f.dayKey(data.leaving.leaveOn)}, unless something takes it out.`
        : "It is in Leaving soon."
    case "deleted":
      return `${SERVICE_NAMES[LEVEL_ARR[data.item.level]]} deleted it${data.fromRun ? ` on ${f.date(data.fromRun.at)}` : ""}. These are the facts that the run saw.`
    default:
      return ""
  }
}

function StateBadge({ data, f }: { data: WhySheetData; f: BoundFormat }) {
  const id = "admin-cleanup-why-state"
  if (data.state === "leaving") return <StatusBadge domain="cleanupItem" value="leaving" data-testid={id} />
  if (data.state === "deleted") return <StatusBadge domain="cleanupItem" value="deleted" sub={data.fromRun ? f.date(data.fromRun.at) : ""} data-testid={id} />
  if (data.state === "notListed") return null
  return <StatusBadge domain="cleanupMatch" value={data.state} data-testid={id} />
}

function LinkButton({ href, label, testId }: { href: string; label: string; testId: string }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      nativeButton={false}
      render={<a href={href} target="_blank" rel="noreferrer" aria-label={`${label}, opens in a new tab`} />}
      data-testid={testId}
    >
      {label}
      <Icon icon={icons.externalLink} />
    </Button>
  )
}

function Header({ data, f, titleRef }: { data: WhySheetData; f: BoundFormat; titleRef: RefObject<HTMLHeadingElement | null> }) {
  const { item, links } = data
  return (
    <div className="flex gap-4 pr-8">
      <Poster ratingKey={item.posterKey} title={item.title} size="sm" decorative className="shrink-0" />
      <div className="flex min-w-0 flex-col items-start gap-2">
        <StateBadge data={data} f={f} />
        <SheetTitle ref={titleRef} tabIndex={-1} className="text-h2 outline-none">
          {itemLabel(item)}
          {item.year !== null && <span className="font-normal text-muted-foreground"> ({item.year})</span>}
        </SheetTitle>
        <SheetDescription className="text-ui text-muted-foreground">{metaLine(data, f)}</SheetDescription>
        <div className="-ml-3 flex flex-wrap gap-x-1">
          {links.plexUrl && <LinkButton href={links.plexUrl} label="Open in Plex" testId="admin-cleanup-why-open-plex" />}
          {links.arrUrl && <LinkButton href={links.arrUrl} label={`Open in ${SERVICE_NAMES[LEVEL_ARR[item.level]]}`} testId="admin-cleanup-why-open-arr" />}
        </div>
      </div>
    </div>
  )
}

/** "To include it" (UX 4.5): the forecast, the Try value with its effect, and Try in the editor. */
function ToInclude({ data, onTry }: { data: WhySheetData; onTry?: (value: TryValue) => void }) {
  const { forecast, tryValue } = data
  if (data.state !== "nearMiss" || (!forecast && !tryValue)) return null
  const field = tryValue ? data.conditions.find((c) => c.id === tryValue.conditionId)?.label : undefined
  const noun = NOUNS[data.item.level]
  const adds = tryValue ? `${tryValue.addsCount} ${tryValue.addsCount === 1 ? noun[0] : noun[1]}, ${formatBytes(BigInt(tryValue.addsBytes))}` : ""
  return (
    <Alert
      tone="info"
      role="note"
      title="To include it"
      icon={<Icon icon={icons.playback} className="mt-0.5 text-info" />}
      data-testid="admin-cleanup-why-include"
    >
      <p>
        {forecast?.text}
        {tryValue && field && `${forecast ? " " : ""}Or change ${field} to ${tryValue.label}: that adds ${adds}.`}
      </p>
      {tryValue && onTry && (
        <Button variant="outline" size="sm" className="mt-3" onClick={() => onTry(tryValue)} data-testid="admin-cleanup-why-try">
          Try {tryValue.label}
        </Button>
      )}
    </Alert>
  )
}

function Hints({ data }: { data: WhySheetData }) {
  const noun = NOUNS[data.item.level][0]
  return data.hints.map((hint) => (
    <Alert key={hint.collection} tone="info" role="note" title="A seasonal title" data-testid="admin-cleanup-why-hint">
      This {noun} is in the Plex collection {hint.collection}, which Kometa makes. Seasonal titles play once a year. To keep them safe in every rule,
      turn on the global protection In the Plex collection.
    </Alert>
  ))
}

function OtherRules({ data, f }: { data: WhySheetData; f: BoundFormat }) {
  if (data.fromRun) return null
  return (
    <section className="flex flex-col gap-1" data-testid="admin-cleanup-why-other-rules">
      <h3 className="text-ui font-semibold text-foreground">Other rules</h3>
      {data.otherRules.length === 0 && <p className="text-ui text-muted-foreground">No other rule matches it.</p>}
      {data.otherRules.map((rule) => (
        <p key={rule.ruleId} className="text-ui text-muted-foreground">
          Also matches <span className="text-foreground">{rule.name}</span>.
          {rule.enteredAt && ` In Leaving soon since ${f.date(rule.enteredAt, "day-month-short")}.`}
          {rule.leaveOn && ` Leaves ${f.dayKey(rule.leaveOn, "day-month-short")}.`}
        </p>
      ))}
    </section>
  )
}

function DataUsed({ data, f }: { data: WhySheetData; f: BoundFormat }) {
  // The Sheet's content mounts at each open, so "today" is the day of the open
  const [now] = useState(() => Date.now())
  const used = data.sources.filter((s) => s.state !== "notConfigured")
  return (
    <section className="flex flex-col gap-2" data-testid="admin-cleanup-why-data">
      <h3 className="text-ui font-semibold text-foreground">Data used</h3>
      {data.fromRun && <p className="text-ui text-muted-foreground">From the run on {f.date(data.fromRun.at)}, {f.time(data.fromRun.at)}.</p>}
      {used.length > 0 && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1">
          {used.map((s) => {
            const name = s.part === "shares" ? "Plex shares" : SERVICE_NAMES[s.service]
            const at = s.readAt ? `, read at ${readTimeText(f, s.readAt, now)}` : ""
            return (
              <li key={`${s.service}-${s.part ?? ""}`}>
                <StatusDot tone={s.state === "failed" ? "destructive" : "success"} label={s.state === "failed" ? `${name} did not answer` : `${name}${at}`} className="text-label" />
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function Body({ data, f, onTry }: { data: WhySheetData; f: BoundFormat; onTry?: (value: TryValue) => void }) {
  return (
    <>
      <p className="text-ui text-foreground" data-testid="admin-cleanup-why-summary">
        {whySummary(data, f)}
      </p>
      <WhyConditions conditions={data.conditions} />
      <ToInclude data={data} onTry={onTry} />
      <Hints data={data} />
      <WhyProtections protections={data.protections} />
      <WhyThen then={data.then} />
      <OtherRules data={data} f={f} />
      <DataUsed data={data} f={f} />
    </>
  )
}

/**
 * The Why Sheet (UX 4.5): why one title is or is not in a rule, with the
 * real values. One Sheet, on the right at 420 px from `md` and at the
 * bottom (at most 85 dvh) below it. Focus goes to its title when it opens,
 * and back to the opener when it closes, or to `finalFocus`. It loads its
 * data with `useCleanupWhy()`. Try shows only with `onTry` (the editor).
 * History is read only.
 */
export function WhySheet(props: WhySheetProps) {
  const { itemKey, onClose, surface, onTry, onActionDone, finalFocus } = props
  const f = useFormat()
  const desktop = useMediaQuery("(min-width: 48rem)")
  const titleRef = useRef<HTMLHeadingElement>(null)
  // The last title stays while the Sheet closes, so its content does not empty during the slide
  const [shown, setShown] = useState(itemKey)
  if (itemKey !== null && itemKey !== shown) setShown(itemKey)
  const why = useCleanupWhy({ itemKey: shown, scope: props.scope, ruleId: props.ruleId, definition: props.definition, outcomeId: props.outcomeId,
    enabled: itemKey !== null })
  const data = why.data

  const tryValue = onTry
    ? (value: TryValue) => {
        onTry(value)
        onClose()
      }
    : undefined

  return (
    <Sheet open={itemKey !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side={desktop ? "right" : "bottom"}
        grabber={!desktop}
        initialFocus={titleRef}
        finalFocus={finalFocus}
        className="gap-0 overflow-hidden p-0"
        data-testid="admin-cleanup-why"
      >
        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-6">
          {data ? (
            <>
              <Header data={data} f={f} titleRef={titleRef} />
              <Body data={data} f={f} onTry={tryValue} />
            </>
          ) : (
            <>
              <SheetTitle ref={titleRef} tabIndex={-1} className="pr-8 text-h2 outline-none">
                {props.title ?? "Why"}
              </SheetTitle>
              {why.isError ? (
                <Alert tone="destructive">{why.error instanceof CleanupWhyFailed ? why.error.message : CONFIRM_FALLBACK_ERROR}</Alert>
              ) : (
                <div className="flex flex-col gap-3" aria-busy="true" data-testid="admin-cleanup-why-loading">
                  <Skeleton className="h-24 w-full" />
                  <Skeleton className="h-40 w-full" />
                </div>
              )}
            </>
          )}
        </div>
        <WhyFooter data={data} surface={surface} onClose={onClose} onActionDone={onActionDone} />
      </SheetContent>
    </Sheet>
  )
}
