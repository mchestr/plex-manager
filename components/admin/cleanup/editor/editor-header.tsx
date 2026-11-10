"use client"

import { Pencil } from "lucide-react"
import Link from "next/link"
import { type KeyboardEvent, type RefObject, useEffect, useId, useLayoutEffect, useRef, useState } from "react"

import { readTimeText } from "@/components/admin/cleanup/preview/read-time"
import { RuleCardMenu, type RuleChange } from "@/components/admin/cleanup/rules/rule-card-menu"
import { Button } from "@/components/ui/button"
import { DiscardChangesDialog } from "@/components/ui/discard-changes-dialog"
import { Icon } from "@/components/ui/icon"
import { Input } from "@/components/ui/input"
import { StatusBadge, StatusDot } from "@/components/ui/status-badge"
import { cleanup, cleanupTurnOn } from "@/lib/admin/routes"
import { useFormat } from "@/lib/format-context"
import type { Level, Mode } from "@/lib/validations/cleanup-vocabulary"

/** The reason on every button that needs the job queue (TS 9.5 item 4). */
export const REDIS_REASON = "Redis is not set up. Library reads and runs need the job queue."

/** The rule's name allows 80 characters (TS 3.5). */
const NAME_MAX = 80

export interface EditorHeaderProps {
  /** Null for a new rule. */
  ruleId: string | null
  /** The draft's name: the page title. */
  name: string
  /** The saved name: the breadcrumb and the discard dialog. */
  savedName: string
  /** The editor's own mode and the saved level, for the badge and the menu. */
  mode: Mode
  level: Level
  lastDryRun: { at: string; matches: number } | null
  /** The render's clock, for "today". */
  now: number
  dirty: boolean
  saving: boolean
  /** The job queue is set up: "Turn on..." needs it. */
  redis: boolean
  /** The rule's titles in Leaving soon, for the menu's dialog words. */
  leavingCount: number
  /** The page title (`tabIndex={-1}`): focus goes there after a create and a discard (UX 7.9). */
  titleRef: RefObject<HTMLHeadingElement | null>
  onRename: (name: string) => void
  onDiscard: () => void
  onSave: () => void
  /** "Save and turn on..." and "Save and change mode...": save, then open the turn-on page. */
  onSaveThenTurnOn: () => void
  onRuleChanged: (change: RuleChange) => void
}

/** Moves focus to `target` once the dialog that held it has gone and left focus nowhere, for an opener that went with it. */
function refocusWhenLost(target: () => HTMLElement | null, frames = 60): void {
  const step = (left: number) => {
    const active = document.activeElement
    if (active === null || active === document.body || !active.isConnected) {
      target()?.focus()
      return
    }
    if (left > 0 && active.closest('[role="dialog"],[role="alertdialog"]')) requestAnimationFrame(() => step(left - 1))
  }
  requestAnimationFrame(() => step(frames))
}

/** The title and its Rename button, or the name input with Save and Cancel (UX 4.3.2). */
function Title({ name, titleRef, onRename }: Pick<EditorHeaderProps, "name" | "titleRef" | "onRename">) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(name)
  const [error, setError] = useState(false)
  const renameRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const errorId = useId()
  // The router keeps a page it leaves (Activity): the name input closes as the page hides (TS 12.1 rule 8.2)
  useLayoutEffect(() => () => setEditing(false), [])
  // Rename puts focus in the name, with the name selected
  useEffect(() => {
    if (!editing) return
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [editing])

  const close = () => {
    setEditing(false)
    setError(false)
    requestAnimationFrame(() => renameRef.current?.focus())
  }
  const save = () => {
    const next = value.trim()
    if (next === "") return setError(true)
    if (next !== name) onRename(next)
    close()
  }
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault()
      save()
    } else if (event.key === "Escape") {
      event.preventDefault()
      close()
    }
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-1.5">
        <h1 className="sr-only">{name}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            aria-label="Rule name"
            value={value}
            ref={inputRef}
            maxLength={NAME_MAX}
            aria-invalid={error || undefined}
            aria-describedby={error ? errorId : undefined}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={onKeyDown}
            className="w-full max-w-md text-h3"
            data-testid="admin-cleanup-editor-rename-input"
          />
          <Button size="sm" onClick={save} data-testid="admin-cleanup-editor-rename-save">
            Save
          </Button>
          <Button variant="ghost" size="sm" onClick={close} data-testid="admin-cleanup-editor-rename-cancel">
            Cancel
          </Button>
        </div>
        {error && (
          <p id={errorId} className="text-label text-destructive">
            Enter a name for the rule.
          </p>
        )}
      </div>
    )
  }
  return (
    <div className="flex min-w-0 items-center gap-2">
      <h1 ref={titleRef} tabIndex={-1} className="min-w-0 text-h1 break-words outline-none">
        {name}
      </h1>
      <Button
        ref={renameRef}
        variant="ghost"
        size="icon-sm"
        aria-label="Rename rule"
        onClick={() => {
          setValue(name)
          setEditing(true)
        }}
        data-testid="admin-cleanup-editor-rename"
      >
        <Icon icon={Pencil} />
      </Button>
    </div>
  )
}

/**
 * The editor header (UX 4.3.2, 4.3.8 item 1): the breadcrumbs, the title
 * with Rename, the meta line, and the actions. "Discard changes..." shows
 * while the draft has changes. The next-step button reads "Turn on..." or
 * "Change mode..." while the draft is clean, and "Save and turn on..." or
 * "Save and change mode..." while it has changes: that press saves first.
 * Then "Save rule". A new rule shows only "Discard changes..." and "Create
 * rule (dry run)". On a phone the next-step button comes first, and Save
 * moves to the count bar.
 */
export function EditorHeader(props: EditorHeaderProps) {
  const { ruleId, savedName, mode, level, lastDryRun, now, dirty, saving, redis, titleRef } = props
  const f = useFormat()
  const reasonId = useId()
  const [discardOpen, setDiscardOpen] = useState(false)
  useLayoutEffect(() => () => setDiscardOpen(false), [])
  const live = mode !== "dryRun"
  const crumb = ruleId ? savedName : "New rule"

  const nextLabel = live ? (dirty ? "Save and change mode..." : "Change mode...") : dirty ? "Save and turn on..." : "Turn on..."
  const nextProps = { variant: "secondary" as const, className: "max-md:order-first", "data-testid": `admin-cleanup-editor-${live ? "change-mode" : "turn-on"}` }
  let next = null
  if (ruleId && !redis) {
    next = (
      <Button {...nextProps} disabled focusableWhenDisabled aria-describedby={reasonId}>
        {nextLabel}
      </Button>
    )
  } else if (ruleId && dirty) {
    next = (
      <Button {...nextProps} disabled={saving} onClick={props.onSaveThenTurnOn}>
        {nextLabel}
      </Button>
    )
  } else if (ruleId) {
    next = (
      <Button {...nextProps} nativeButton={false} render={<Link href={cleanupTurnOn(ruleId)} />}>
        {nextLabel}
      </Button>
    )
  }

  return (
    <header data-slot="page-header" className="flex flex-col gap-3" data-testid="admin-cleanup-editor-header">
      <nav aria-label="Breadcrumb">
        <ol className="flex flex-wrap items-center gap-1.5 text-label text-muted-foreground">
          <li>
            <Link href={cleanup()} className="rounded-sm hover:text-foreground" data-testid="admin-cleanup-editor-header-crumb-0">
              Media cleanup
            </Link>
          </li>
          <li aria-hidden="true" className="select-none">
            /
          </li>
          <li>
            <Link href={cleanup()} className="rounded-sm hover:text-foreground" data-testid="admin-cleanup-editor-header-crumb-1">
              Rules
            </Link>
          </li>
          <li aria-hidden="true" className="select-none max-md:hidden">
            /
          </li>
          <li className="max-md:hidden">
            <span aria-current="page" className="text-foreground">
              {crumb}
            </span>
          </li>
        </ol>
      </nav>
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="flex min-w-0 flex-col gap-1.5">
          <Title name={props.name} titleRef={titleRef} onRename={props.onRename} />
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <StatusBadge domain="cleanupMode" value={mode} data-testid="admin-cleanup-editor-mode" />
            {lastDryRun && (
              <span className="text-ui text-muted-foreground max-md:hidden" data-testid="admin-cleanup-editor-last-dry-run-timestamp">
                Last dry run {readTimeText(f, lastDryRun.at, now)}: {f.number(lastDryRun.matches)} {lastDryRun.matches === 1 ? "match" : "matches"}
              </span>
            )}
            {dirty && <StatusDot tone="info" label="Unsaved changes" data-testid="admin-cleanup-editor-unsaved" />}
          </div>
        </div>
        <div data-slot="page-header-actions" className="flex shrink-0 flex-wrap items-center gap-2">
          {dirty && (
            <Button variant="ghost" disabled={saving} onClick={() => setDiscardOpen(true)} data-testid="admin-cleanup-editor-discard">
              Discard changes...
            </Button>
          )}
          {ruleId && (
            <RuleCardMenu
              variant="editor"
              rule={{ id: ruleId, name: savedName, level, mode }}
              leavingCount={props.leavingCount}
              redis={redis}
              onRuleChanged={props.onRuleChanged}
            />
          )}
          {next}
          {ruleId ? (
            <Button
              disabled={!dirty}
              focusableWhenDisabled
              loading={saving}
              loadingLabel="Saving"
              onClick={props.onSave}
              className="max-md:hidden"
              data-testid="admin-cleanup-editor-save"
            >
              Save rule
            </Button>
          ) : (
            <Button loading={saving} loadingLabel="Creating" onClick={props.onSave} className="max-md:hidden" data-testid="admin-cleanup-editor-create">
              Create rule (dry run)
            </Button>
          )}
          {ruleId && !redis && (
            <span id={reasonId} className="sr-only">
              {REDIS_REASON}
            </span>
          )}
        </div>
      </div>
      <DiscardChangesDialog
        open={discardOpen}
        onOpenChange={setDiscardOpen}
        title={savedName}
        onDiscard={() => {
          props.onDiscard()
          refocusWhenLost(() => titleRef.current)
        }}
        data-testid="admin-cleanup-editor-discard-dialog"
      />
    </header>
  )
}
