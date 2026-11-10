"use client"

import { Fragment } from "react"

import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { Token, type StaticTokenLook, type TokenState } from "@/components/ui/token"
import type { DraftAction } from "@/lib/cleanup/editor/draft"
import type { EditorFocusPart, FocusTarget } from "@/lib/cleanup/editor/focus"
import { sameJson } from "@/lib/cleanup/editor/stable-json"
import { findCondition } from "@/lib/cleanup/editor/tree"
import type { DescribeWords } from "@/lib/cleanup/engine/types"
import { anyFieldMeta, notApplicableMessage } from "@/lib/cleanup/fields/catalog"
import { draftRowParts, INCOMPLETE_NOTE, partsText } from "@/lib/cleanup/fields/sentence"
import { SERVICE_NAMES } from "@/lib/cleanup/fields/words"
import type { PreviewResponse } from "@/lib/cleanup/types/preview"
import { icons } from "@/lib/ui/icons"
import { cn } from "@/lib/utils"
import type { DraftCondition, RuleDraft } from "@/lib/validations/cleanup-draft"
import { FIELD_LEVELS, type Level, type Service } from "@/lib/validations/cleanup-vocabulary"

/** The part of a row that opened the condition editor: a desktop token, or the phone box (UX 4.3.8). */
export type Anchor = "field" | "operator" | "value" | "box"

/** Where a row sits: its number among the conditions (or protections) of the rule, and in its group. */
export interface RowPosition {
  /** 1-based, over every condition row in reading order (group members included), or every protection. */
  n: number
  total: number
  /** A member of an any-of group. */
  inGroup?: boolean
}

/**
 * What every row of the builder reads: the draft facts, the preview counts,
 * the save errors and the handlers. `builder-form.tsx` makes it once a render.
 */
export interface RowKit {
  level: Level
  words: DescribeWords
  /** The saved definition, for the changed dot (UX 4.12.1). Null for a new rule. */
  saved: RuleDraft | null
  /** Save errors by condition or group id. */
  errors: ReadonlyMap<string, string>
  /** "{N} more without it" by top-level clause id. */
  held: ReadonlyMap<string, number>
  /** "keeps {N} safe" by rule protection id. */
  keeps: ReadonlyMap<string, number>
  /** Failed sources: "Tautulli did not answer at 3:07 AM". */
  failed: ReadonlyMap<Service, string>
  historyStart: string | null
  zone: string
  /** The row and part whose condition editor is open. */
  open: { id: string; anchor: Anchor } | null
  /** The top-level conditions, for "Move into an any-of group with...". */
  targets: readonly { id: string; sentence: string }[]
  /** Condition rows in the rule: the last one cannot be removed (UX 7.2 item 7). */
  conditionCount: number
  onOpen: (id: string, anchor: Anchor) => void
  onAction: (action: DraftAction) => void
}

type TokenPart = "field" | "operator" | "value"
export type ViewPart = { kind: "token"; part: TokenPart; text: string; state: TokenState } | { kind: "text"; text: string }

export interface RowView {
  id: string
  /** `admin-cleanup-condition-{id}` or `admin-cleanup-protection-{id}` (UX 10.2). */
  base: string
  role: "condition" | "protection"
  parts: ViewPart[]
  /** "Last played more than 365 days ago, or never" */
  sentence: string
  /** The number of the held-back text, and how it reads. Null when the preview has none. */
  held: { count: number; kind: "more" | "keeps" } | null
  incomplete: boolean
  /** The line under the row: a save error, then the not-applicable and the source-failed text. */
  notice: { tone: "destructive" | "warning"; text: string } | null
  help: string | null
  /** "Condition 2 of 4", "Protection 1 of 1", "Condition 1 of 2 in the any-of group". */
  caption: string
  sourceName?: string
}

/** The source-failed words of each failed service (UX 4.3.9, UX 8.4): "Tautulli did not answer at 3:07 AM". */
export function failedSources(preview: Pick<PreviewResponse, "sources" | "snapshot">, time: (at: string) => string): Map<Service, string> {
  const failed = new Map<Service, string>()
  for (const source of preview.sources) {
    if (source.state !== "failed" || failed.has(source.service)) continue
    const at = source.readAt ?? preview.snapshot?.takenAt
    failed.set(source.service, `${SERVICE_NAMES[source.service]} did not answer${at ? ` at ${time(at)}` : ""}`)
  }
  return failed
}

/** The test id base of a condition or protection row (UX 10.2). Protection ids start with "p". */
const rowBase = (id: string): string => (id.startsWith("p") ? `admin-cleanup-protection-${id}` : `admin-cleanup-condition-${id}`)

/** The held-back words: "22 more without it", "Keeps 7 safe" (UX 8.4). */
function heldWords(held: RowView["held"], incomplete: boolean): string | null {
  if (incomplete) return INCOMPLETE_NOTE.replace(/\.$/, "")
  if (!held) return null
  return held.kind === "keeps" ? `Keeps ${held.count} safe` : `${held.count} more without it`
}

function changedParts(c: DraftCondition, saved: RuleDraft | null): Set<TokenPart> {
  const before = saved ? findCondition(saved, c.id) : null
  const changed = new Set<TokenPart>()
  if (!before) return changed
  if (before.field !== c.field) changed.add("field")
  if (before.op !== c.op) changed.add("operator")
  if (!sameJson(before.value, c.value)) changed.add("value")
  return changed
}

/** The words, token states and side texts of one row, shared by the desktop toolbar and the phone box. */
export function rowView(c: DraftCondition, position: RowPosition, kit: RowKit): RowView {
  const role = c.id.startsWith("p") ? "protection" : "condition"
  const meta = anyFieldMeta(c.field)
  const { parts: raw, complete } = draftRowParts(c, kit.level, kit.words)
  const notApplicable = !FIELD_LEVELS[c.field].includes(kit.level)
  const error = kit.errors.get(c.id) ?? null
  const failed = meta.sources(kit.level).find((service) => kit.failed.has(service))
  const changed = changedParts(c, kit.saved)
  const tokens = raw.filter((p) => p.kind !== "text")
  const last = tokens[tokens.length - 1]

  const stateOf = (part: TokenPart, index: number): TokenState => {
    if (kit.open?.id === c.id && kit.open.anchor === part) return "open"
    if (notApplicable) return "notApplicable"
    if (error && raw[index] === last) return "error"
    if (!complete && part === "value") return "incomplete"
    if (failed && part === "field") return "sourceFailed"
    return changed.has(part) ? "changed" : "default"
  }
  const parts: ViewPart[] = raw.map((p, i) => (p.kind === "text" ? p : { kind: "token", part: p.kind, text: p.text, state: stateOf(p.kind, i) }))

  const count = role === "protection" ? kit.keeps.get(c.id) : position.inGroup ? undefined : kit.held.get(c.id)
  const notice = error
    ? { tone: "destructive" as const, text: error }
    : notApplicable
      ? { tone: "warning" as const, text: notApplicableMessage(c.field, kit.level) }
      : failed
        ? { tone: "warning" as const, text: kit.failed.get(failed) ?? "" }
        : null
  const noun = role === "protection" ? "Protection" : "Condition"
  return {
    id: c.id,
    base: rowBase(c.id),
    role,
    parts,
    sentence: partsText(raw),
    held: count === undefined ? null : { count, kind: role === "protection" ? "keeps" : "more" },
    incomplete: !complete,
    notice,
    help: meta.rowHelp?.({ historyStart: kit.historyStart, level: kit.level, zone: kit.zone }) ?? null,
    caption: `${noun} ${position.n} of ${position.total}${position.inGroup ? " in the any-of group" : ""}`,
    sourceName: failed ? SERVICE_NAMES[failed] : undefined,
  }
}

/** The name of the phone box (UX 4.3.8 item 2.1): "{sentence}. {held-back text}. Change condition {n} of {N}." @internal */
export function boxName(view: RowView): string {
  const held = heldWords(view.held, view.incomplete)
  const change = view.caption.replace(/^(Condition|Protection)/, (word) => `Change ${word.toLowerCase()}`)
  return [view.sentence, held, change].filter(Boolean).join(". ") + "."
}

const LOOKS: Partial<Record<TokenState, StaticTokenLook>> = {
  error: "error",
  notApplicable: "notApplicable",
  incomplete: "incomplete",
  sourceFailed: "sourceFailed",
}

interface ConditionBoxProps {
  view: RowView
  /** The notice line under the row, which the box shares with the toolbar. */
  describedBy?: string
  onPress: () => void
}

/**
 * The phone form of a condition or protection row (UX 4.3.8 item 2): one
 * bordered `Button` with static token parts and a trailing chevron, so no
 * button nests in another. It shows below `md` only; the desktop toolbar
 * stays in the DOM beside it, so the box has its own test ids (`-box`,
 * `-box-{part}`, `-box-held`, UX 10.1 item 7). Its name starts with the
 * visible sentence (SC 2.5.3).
 */
export function ConditionBox({ view, describedBy, onPress }: ConditionBoxProps) {
  const box = `${view.base}-box`
  const held = view.incomplete ? INCOMPLETE_NOTE : view.held
  return (
    <Button
      variant="outline"
      aria-label={boxName(view)}
      aria-describedby={describedBy}
      aria-haspopup="dialog"
      onClick={onPress}
      data-layout="phone"
      data-testid={box}
      className={cn(
        "h-auto w-full items-start justify-between gap-2 rounded-lg bg-card px-3 py-2.5 text-left font-normal whitespace-normal md:hidden",
        view.notice?.tone === "destructive" && "border-destructive"
      )}
    >
      <span className="flex min-w-0 flex-col gap-1.5">
        <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1.5 text-body text-foreground">
          {/* A space between the parts: flex hides it, and the text that axe and screen readers read keeps its words apart (SC 2.5.3) */}
          {view.parts.map((part, i) => (
            <Fragment key={i}>
              {i > 0 && " "}
              {part.kind === "text" ? (
                <span>{part.text}</span>
              ) : (
                <Token part={part.part} state="static" look={LOOKS[part.state] ?? "default"} data-testid={`${box}-${part.part}`}>
                  {part.text}
                </Token>
              )}
            </Fragment>
          ))}
        </span>
        {held && " "}
        {held && (
          <span className="text-caption text-muted-foreground" data-testid={`${box}-held`}>
            {typeof held === "string" ? held : <HeldText held={held} />}
          </span>
        )}
      </span>
      <Icon icon={icons.chevronRight} className="mt-2 text-muted-foreground" />
    </Button>
  )
}

/** "**22** more without it" or "keeps **7** safe", with the number strong. */
export function HeldText({ held }: { held: NonNullable<RowView["held"]> }) {
  const n = <strong className="font-semibold text-foreground tabular-nums">{held.count}</strong>
  return held.kind === "keeps" ? <>keeps {n} safe</> : <>{n} more without it</>
}

/** True when an element is in the layout: a phone box below `md`, a desktop token from `md`. @internal */
export function shown(element: Element | null): element is HTMLElement {
  return element instanceof HTMLElement && (typeof element.checkVisibility !== "function" || element.checkVisibility())
}

/**
 * The element of a row that takes focus or anchors the editor: the token of
 * `anchor` (else the first token) on desktop, the box on a phone, whichever
 * shows.
 */
export function rowElement(root: ParentNode | null, id: string, anchor: Anchor = "field"): HTMLElement | null {
  if (!root) return null
  const base = rowBase(id)
  const find = (testId: string) => root.querySelector(`[data-testid="${testId}"]`)
  const token = (anchor !== "box" && find(`${base}-${anchor}`)) || find(`${base}-field`)
  const box = find(`${base}-box`)
  if (shown(token)) return token
  if (shown(box)) return box
  return null
}

const CONTROL_IDS = { libraries: "admin-cleanup-scope-libraries", grace: "admin-cleanup-then-grace", action: "admin-cleanup-then-action" } as const
const byTestId = (root: ParentNode, id: string) => root.querySelector<HTMLElement>(`[data-testid="${id}"]`)

/** The element of a focus target (UX 7.9), or null for the targets of the editor root. */
export function targetElement(root: HTMLElement | null, target: FocusTarget): HTMLElement | null {
  if (!root) return null
  switch (target.kind) {
    case "row":
      return rowElement(root, target.id)
    case "token":
      return rowElement(root, target.id, target.part === "new" ? "field" : target.part)
    case "add":
      return byTestId(root, target.list === "protections" ? "admin-cleanup-add-protection" : "admin-cleanup-add-condition")
    case "group":
      return root.querySelector<HTMLElement>(`[data-group-title="${target.id}"]`)
    case "control":
      return byTestId(root, CONTROL_IDS[target.name])
    case "summary":
      return byTestId(root, "admin-cleanup-error-summary")
    default:
      return null
  }
}

/** The token that anchors an editor opened at a part: the value token for every value control. */
export const anchorOf = (part: EditorFocusPart): Anchor => (part === "field" || part === "operator" ? part : part === "fieldSearch" ? "field" : "value")
