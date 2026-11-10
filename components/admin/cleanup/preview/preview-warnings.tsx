import type { ReactNode } from "react"

import { type ClauseLabel, labelOf } from "@/components/admin/cleanup/preview/clause-labels"
import { sizeText } from "@/components/admin/cleanup/preview/sizes"
import { Alert } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { joinAnd, LEVEL_NAMES, nounWord, SERVICE_NAMES } from "@/lib/cleanup/fields/words"
import type { PreviewResponse, PreviewWarning } from "@/lib/cleanup/types/preview"
import { icons } from "@/lib/ui/icons"
import type { BoundFormat } from "@/lib/utils/format"

/** "Refresh data now" on the card: the editor root passes the refresh action and its state. */
export interface PreviewRefresh {
  onRefresh: () => void
  pending?: boolean
  disabled?: boolean
}

interface PreviewWarningsProps {
  data: PreviewResponse
  labels: readonly ClauseLabel[]
  /** The sentence of each global protection by id ("g4"), from the editor loader. */
  globals?: Readonly<Record<string, string>>
  /** The last request got a 429 (UX 7.11 item 5). */
  rateLimited?: boolean
  f: BoundFormat
  /** "Change {field}" of the zero-match note: opens the editor of that condition. */
  onChangeCondition?: (conditionId: string) => void
  refresh?: PreviewRefresh
}

type Of<K extends PreviewWarning["kind"]> = Extract<PreviewWarning, { kind: K }>

const quoted = (text: string) => `"${text}"`

function contradiction(w: Of<"cannotMatch">, labels: readonly ClauseLabel[], globals: Readonly<Record<string, string>>): string | null {
  const first = labelOf(labels, w.conditionId)
  if (!first) return null
  if (w.otherId === w.conditionId) return `${quoted(first.sentence)} can never be true.`
  const global = globals[w.otherId]
  if (global !== undefined) return `${quoted(first.sentence)} and the global protection ${quoted(global)} cancel out.`
  const other = labelOf(labels, w.otherId)
  return other ? `${quoted(first.sentence)} and ${quoted(other.sentence)} cancel out.` : null
}

function zeroText(w: Of<"zero">, sentence: string, data: PreviewResponse, f: BoundFormat): string {
  const parts = [`${quoted(sentence)} leaves ${f.number(w.leaves)} of ${f.number(w.of)}.`]
  if (w.largestBytes !== null) parts.push(`The largest ${nounWord(1, data.level)} that passes the other conditions is ${sizeText(w.largestBytes)}.`)
  if (w.nearMisses > 0) parts.push(`Near misses shows the ${f.number(w.nearMisses)} closest.`)
  return parts.join(" ")
}

function sourceFailedText(failed: Of<"sourceFailed">[], data: PreviewResponse, f: BoundFormat) {
  const names = joinAnd(failed.map((w) => SERVICE_NAMES[w.service]))
  const readAt = failed.find((w) => w.readAt !== null)?.readAt
  const missing = data.tabs.missing
  return {
    title: readAt ? `${names} did not answer at ${f.time(readAt)}` : `${names} did not answer`,
    body:
      `${f.number(missing)} ${nounWord(missing, data.level)} ${missing === 1 ? "is" : "are"} in Missing data. ` +
      `Unknown never matches, and runs change nothing until ${names} ${failed.length === 1 ? "answers" : "answer"}.`,
  }
}

/**
 * The notes under the preview headline (UX 4.3.6, 4.3.9 and 8.4): the rate
 * limit, the first read, the wide rule, a rule that can never match, zero
 * matches with "Change {field}", failed sources and stale data. Each kind
 * shows once. Every alert is `role="status"`: they come and go while the
 * admin edits (UX 7.10 item 7).
 */
export function PreviewWarnings({ data, labels, globals = {}, rateLimited = false, f, onChangeCondition, refresh }: PreviewWarningsProps) {
  const of = <K extends PreviewWarning["kind"]>(kind: K) => data.warnings.filter((w): w is Of<K> => w.kind === kind)
  const notes: ReactNode[] = []
  const id = (kind: string) => `admin-cleanup-preview-alert-${kind}`
  const failed = of("sourceFailed")
  // One "Refresh data now" under the alerts: a failed source, else stale data
  const refreshOn = failed.length > 0 ? "source-failed" : "stale"
  const refreshButton = (kind: string) => {
    if (!refresh || kind !== refreshOn) return null
    return (
      <Button
        variant="outline"
        size="sm"
        className="w-full"
        icon={<Icon icon={icons.sync} />}
        loading={refresh.pending ?? false}
        loadingLabel="Reading"
        disabled={refresh.disabled}
        onClick={refresh.onRefresh}
        data-testid={`${id(kind)}-action`}
      >
        Refresh data now
      </Button>
    )
  }

  if (rateLimited) {
    notes.push(<Alert key="rate" role="status" tone="warning" title="Too many updates" data-testid={id("rate-limit")}>The preview pauses for a minute.</Alert>)
  }
  if (data.snapshot === null) {
    notes.push(
      <p key="first" role="status" className="text-ui text-muted-foreground" data-testid={id("first-read")}>
        Reading your library for the first time. This takes 1 to 3 minutes. You can leave this page.
      </p>
    )
  }
  for (const w of of("wide").slice(0, 1)) {
    notes.push(
      <Alert key="wide" role="status" tone="warning" title={`This rule matches ${f.number(w.percent)} % of ${LEVEL_NAMES[data.level]} (${f.number(w.matches)} of ${f.number(w.checked)})`} data-testid={id("wide")}>
        Check the conditions. Turn on offers only Review first for a first batch above 10 %.
      </Alert>
    )
  }
  const pairs = of("cannotMatch").flatMap((w) => contradiction(w, labels, globals) ?? [])
  if (pairs.length > 0) {
    notes.push(
      <Alert key="cannot" role="status" tone="warning" title="This rule can never match" data-testid={id("cannot-match")}>
        {pairs.join(" ")} You can still save it.
      </Alert>
    )
  }
  for (const w of of("zero").slice(0, 1)) {
    const label = labelOf(labels, w.conditionId)
    if (!label) continue
    notes.push(
      <Alert key="zero" role="status" tone="info" title="No matches" data-testid={id("zero")}>
        <p>{zeroText(w, label.sentence, data, f)}</p>
        {onChangeCondition && (
          <Button variant="outline" size="sm" className="mt-2" onClick={() => onChangeCondition(w.conditionId)} data-testid={`${id("zero")}-action`}>
            Change {label.name}
          </Button>
        )}
      </Alert>
    )
  }
  if (failed.length > 0) {
    const { title, body } = sourceFailedText(failed, data, f)
    notes.push(
      <div key="failed" className="flex flex-col gap-2">
        <Alert role="status" tone="destructive" title={title} data-testid={id("source-failed")}>
          {body}
        </Alert>
        {refreshButton("source-failed")}
      </div>
    )
  }
  for (const w of of("stale").slice(0, 1)) {
    notes.push(
      <div key="stale" className="flex flex-col gap-2">
        <Alert role="status" tone="warning" title={`Library data is ${f.number(w.hours)} ${w.hours === 1 ? "hour" : "hours"} old`} data-testid={id("stale")}>
          The nightly read did not finish. Runs change nothing until a fresh read. The preview still works on the old data.
        </Alert>
        {refreshButton("stale")}
      </div>
    )
  }

  if (notes.length === 0) return null
  return <div className="flex flex-col gap-3">{notes}</div>
}
