"use client"

import { type FocusEvent, type KeyboardEvent, useId, useState } from "react"

import { ConditionBox, HeldText, type RowKit, type RowPosition, rowView, type ViewPart } from "@/components/admin/cleanup/editor/condition-box"
import { ConditionMenu } from "@/components/admin/cleanup/editor/condition-menu"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { Token } from "@/components/ui/token"
import { INCOMPLETE_NOTE } from "@/lib/cleanup/fields/sentence"
import { icons } from "@/lib/ui/icons"
import { cn } from "@/lib/utils"
import type { DraftCondition } from "@/lib/validations/cleanup-draft"

/** The reason on the last condition's Remove button (UX 7.2 item 7, UX 8.4). @internal */
export const LAST_CONDITION_REASON = "A rule needs at least one condition"

interface ConditionRowProps {
  condition: DraftCondition
  position: RowPosition
  /** "and" between top-level clauses, "or" inside a group and between protections. Null on the first row. */
  gutter: "and" | "or" | null
  kit: RowKit
}

const ROVING = "[data-roving]"

/**
 * One condition or rule protection (UX 4.3.4). From `md` it is a toolbar
 * named by its sentence: the gutter word, the tokens of the row grammar
 * (TS 4.2) with static words between them, the held-back text, the row menu
 * and the remove button. It is one tab stop: Left and Right move between its
 * tokens and buttons, Home and End jump, Delete and Backspace on a token
 * remove the row with Undo (UX 7.8). A token press opens the condition editor
 * at that part. Below `md` the phone box takes its place (`condition-box.tsx`).
 * The help and notice lines sit under both, linked with `aria-describedby`.
 */
export function ConditionRow({ condition, position, gutter, kit }: ConditionRowProps) {
  const view = rowView(condition, position, kit)
  const [active, setActive] = useState(0)
  const ids = useId()
  const helpId = `${ids}-help`
  const noticeId = `${ids}-notice`
  const reasonId = `${ids}-reason`
  const { id, base } = view

  const tokens = view.parts.filter((part): part is Extract<ViewPart, { kind: "token" }> => part.kind === "token")
  const stops = tokens.length + 2
  const current = Math.min(active, stops - 1)
  const canRemove = view.role === "protection" || kit.conditionCount > 1
  const kind = view.role === "protection" ? "protection" : position.inGroup ? "member" : "condition"
  const noun = view.role === "protection" ? "protection" : "condition"
  const describedBy = [view.help && helpId, view.notice && noticeId].filter(Boolean).join(" ") || undefined

  const track = (event: FocusEvent<HTMLElement>) => {
    const index = Number(event.currentTarget.dataset.roving)
    if (Number.isInteger(index)) setActive(index)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const toolbar = event.currentTarget
    const target = event.target
    // Keys from a portalled menu bubble through React; only the toolbar's own controls move focus
    if (!(target instanceof HTMLElement) || !toolbar.contains(target) || event.altKey || event.ctrlKey || event.metaKey) return
    const items = Array.from(toolbar.querySelectorAll<HTMLElement>(ROVING))
    const from = items.findIndex((element) => element === target || element.contains(target))
    if (from < 0) return
    if ((event.key === "Delete" || event.key === "Backspace") && target.dataset.slot === "token") {
      event.preventDefault()
      kit.onAction({ type: "remove", id })
      return
    }
    const to = { ArrowLeft: from - 1, ArrowRight: from + 1, Home: 0, End: items.length - 1 }[event.key]
    if (to === undefined) return
    event.preventDefault()
    const next = Math.max(0, Math.min(items.length - 1, to))
    setActive(next)
    items[next].focus()
  }

  // The roving index of the part at `i`: the tokens before it
  const stopOf = (i: number) => view.parts.slice(0, i).filter((part) => part.kind === "token").length
  return (
    <div data-slot="condition-row" data-row={id} className="flex flex-col gap-1">
      {gutter && (
        <span aria-hidden="true" className="pl-1 text-label text-muted-foreground italic md:hidden">
          {gutter}
        </span>
      )}
      <div
        role="toolbar"
        aria-label={`${view.caption}: ${view.sentence}.`}
        aria-describedby={describedBy}
        onKeyDown={onKeyDown}
        data-layout="desktop"
        data-testid={base}
        className={cn(
          "hidden min-h-9 items-center gap-x-2 rounded-md py-0.5 md:flex",
          kit.open?.id === id && kit.open.anchor !== "box" && "bg-accent/40"
        )}
      >
        <span aria-hidden="true" className="w-8 shrink-0 text-right text-label text-muted-foreground italic">
          {gutter}
        </span>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-1 text-ui text-foreground">
          {view.parts.map((part, i) => {
            if (part.kind === "text") return <span key={i}>{part.text}</span>
            const index = stopOf(i)
            return (
              <Token
                key={i}
                part={part.part}
                state={part.state}
                sourceName={view.sourceName}
                tabIndex={current === index ? 0 : -1}
                onFocus={track}
                onClick={() => kit.onOpen(id, part.part)}
                aria-describedby={part.state === "error" || part.state === "notApplicable" ? noticeId : undefined}
                data-roving={index}
                data-testid={`${base}-${part.part}`}
              >
                {part.text}
              </Token>
            )
          })}
        </div>
        {(view.held || view.incomplete) && (
          <span className="shrink-0 text-caption text-muted-foreground" data-testid={`${base}-held`}>
            {view.incomplete ? INCOMPLETE_NOTE : view.held && <HeldText held={view.held} />}
          </span>
        )}
        <div className="flex shrink-0 items-center">
          <ConditionMenu
            id={id}
            kind={kind}
            targets={kit.targets}
            variant="row"
            canRemove={canRemove}
            onAction={kit.onAction}
            tabIndex={current === tokens.length ? 0 : -1}
            onFocus={track}
            data-roving={tokens.length}
          />
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Remove ${noun}`}
            aria-describedby={canRemove ? undefined : reasonId}
            disabled={!canRemove}
            focusableWhenDisabled
            tabIndex={current === tokens.length + 1 ? 0 : -1}
            onFocus={track}
            onClick={() => kit.onAction({ type: "remove", id })}
            data-roving={tokens.length + 1}
            className="text-muted-foreground"
            data-testid={`${base}-remove`}
          >
            <Icon icon={icons.close} />
          </Button>
        </div>
      </div>
      {!canRemove && (
        <span id={reasonId} className="sr-only">
          {LAST_CONDITION_REASON}
        </span>
      )}
      {view.help && (
        <p id={helpId} className="hidden pl-10 text-label text-muted-foreground md:block" data-testid={`${base}-help`}>
          {view.help}
        </p>
      )}
      <ConditionBox view={view} describedBy={view.notice ? noticeId : undefined} onPress={() => kit.onOpen(id, "box")} />
      {view.notice && (
        <p
          id={noticeId}
          className={cn("flex items-start gap-1.5 text-label md:pl-10", view.notice.tone === "destructive" ? "text-destructive" : "text-warning")}
          data-testid={`${base}-error`}
        >
          <Icon icon={view.notice.tone === "destructive" ? icons.error : icons.warning} size={14} className="mt-0.5" />
          {view.notice.text}
        </p>
      )}
    </div>
  )
}
