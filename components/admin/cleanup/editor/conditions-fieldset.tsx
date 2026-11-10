"use client"

import { Plus } from "lucide-react"
import type { ReactNode } from "react"

import type { RowKit } from "@/components/admin/cleanup/editor/condition-box"
import { ConditionRow } from "@/components/admin/cleanup/editor/condition-row"
import { GroupBox } from "@/components/admin/cleanup/editor/group-box"
import { UndoLine } from "@/components/admin/cleanup/editor/undo-line"
import { Button } from "@/components/ui/button"
import { Fieldset } from "@/components/ui/fieldset"
import { Icon } from "@/components/ui/icon"
import type { UndoRecord } from "@/lib/cleanup/editor/draft"
import { MAX_CLAUSES } from "@/lib/cleanup/editor/draft-ops"
import { type Clause, isGroup } from "@/lib/cleanup/editor/tree"
import { NOUNS } from "@/lib/cleanup/fields/words"
import { icons } from "@/lib/ui/icons"
import { cn } from "@/lib/utils"

/** The full-width 44 px add buttons of a phone (UX 4.3.8 item 3). */
export const PHONE_ADD = "max-md:h-11 max-md:w-full max-md:px-5 max-md:text-body"

/**
 * Where the Undo line of a removed condition goes (UX 7.2 item 2): in place
 * of a removed member inside its group while the group stays, else in place
 * of the removed top-level clause.
 *
 * @internal Exported for tests.
 */
export function undoPlace(undo: UndoRecord, clauses: readonly Clause[]): { at: number; group?: string } | null {
  const before = undo.before.conditions
  const index = before.findIndex((c) => c.id === undo.removed.id || (isGroup(c) && c.conditions.some((m) => m.id === undo.removed.id)))
  if (index < 0) return null
  const holder = before[index]
  if (holder.id !== undo.removed.id && isGroup(holder) && clauses.some((c) => c.id === holder.id)) {
    return { at: holder.conditions.findIndex((m) => m.id === undo.removed.id), group: holder.id }
  }
  return { at: index }
}

interface ConditionsFieldsetProps {
  clauses: readonly Clause[]
  kit: RowKit
  /** The undo record of the last removal, when it was a condition or a group. */
  undo: UndoRecord | null
}

/**
 * The second part of the sentence (UX 4.3.3): "Find movies where all of
 * these are true", with "Order does not matter.", the condition rows and
 * any-of groups, the Undo line in place of a removed row, and the buttons
 * "Add condition" and "Add an any-of group". On a phone the note adds
 * "Select a condition to change it." and the add buttons are 44 px.
 */
export function ConditionsFieldset({ clauses, kit, undo }: ConditionsFieldsetProps) {
  const level = kit.level
  const place = undo && undo.list === "conditions" ? undoPlace(undo, clauses) : null
  const line = undo && place && <UndoLine undo={undo} level={level} words={kit.words} onUndo={() => kit.onAction({ type: "undo" })} />

  let n = 1
  const items: ReactNode[] = []
  clauses.forEach((clause, i) => {
    if (place && !place.group && place.at === i) items.push(<div key="undo">{line}</div>)
    const gutter = i === 0 ? null : "and"
    if (isGroup(clause)) {
      const inGroup = place?.group === clause.id ? { at: place.at, line } : null
      items.push(<GroupBox key={clause.id} group={clause} first={n} kit={kit} gutter={gutter} undo={inGroup} />)
      n += clause.conditions.length
    } else {
      items.push(<ConditionRow key={clause.id} condition={clause} position={{ n, total: kit.conditionCount }} gutter={gutter} kit={kit} />)
      n += 1
    }
  })
  if (place && !place.group && place.at >= clauses.length) items.push(<div key="undo">{line}</div>)

  const full = clauses.length >= MAX_CLAUSES
  return (
    <Fieldset
      legend={`Find ${NOUNS[level][1]} where all of these are true`}
      note={
        <>
          <span className="md:hidden">Select a condition to change it. </span>
          Order does not matter.
        </>
      }
    >
      <div className="flex flex-col gap-2">{items}</div>
      <div className="flex flex-col items-center gap-1 md:flex-row md:gap-2 md:pl-10">
        <Button
          variant="outline"
          size="sm"
          icon={<Icon icon={Plus} />}
          disabled={full}
          onClick={() => kit.onAction({ type: "add", to: "conditions" })}
          className={PHONE_ADD}
          data-testid="admin-cleanup-add-condition"
        >
          Add condition
        </Button>
        <Button
          variant="ghost"
          size="sm"
          icon={<Icon icon={icons.group} />}
          disabled={full}
          onClick={() => kit.onAction({ type: "addGroup" })}
          className={cn("max-md:h-11")}
          data-testid="admin-cleanup-add-group"
        >
          Add an any-of group
        </Button>
      </div>
    </Fieldset>
  )
}
