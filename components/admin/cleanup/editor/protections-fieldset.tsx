"use client"

import { Plus } from "lucide-react"
import type { ReactNode } from "react"

import type { RowKit } from "@/components/admin/cleanup/editor/condition-box"
import { ConditionRow } from "@/components/admin/cleanup/editor/condition-row"
import { PHONE_ADD } from "@/components/admin/cleanup/editor/conditions-fieldset"
import { GlobalProtectionsLine } from "@/components/admin/cleanup/editor/global-protections-line"
import { UndoLine } from "@/components/admin/cleanup/editor/undo-line"
import { Button } from "@/components/ui/button"
import { Fieldset } from "@/components/ui/fieldset"
import { Icon } from "@/components/ui/icon"
import type { UndoRecord } from "@/lib/cleanup/editor/draft"
import { MAX_PROTECTIONS } from "@/lib/cleanup/editor/draft-ops"
import { NOUNS } from "@/lib/cleanup/fields/words"
import type { EditorGlobalProtection } from "@/lib/cleanup/types/rule-parts"
import type { DraftCondition } from "@/lib/validations/cleanup-draft"

interface ProtectionsFieldsetProps {
  protections: readonly DraftCondition[]
  kit: RowKit
  /** The undo record of the last removal, when it was a protection. */
  undo: UndoRecord | null
  globals: readonly EditorGlobalProtection[]
  /** The items each protection keeps safe in the preview, by id. */
  counts: ReadonlyMap<string, number>
  /** The items that pass every condition and that a protection keeps safe. */
  kept: number
}

/**
 * The third part of the sentence (UX 4.3.3, 5.4): "Never touch", with "If any
 * of these is true, the movie is safe.", the global protections line, then
 * "This rule only" with the rule protection rows ("keeps N safe", joined with
 * "or") and "Add protection".
 */
export function ProtectionsFieldset({ protections, kit, undo, globals, counts, kept }: ProtectionsFieldsetProps) {
  const level = kit.level
  const at = undo && undo.list === "protections" ? undo.before.protections.findIndex((p) => p.id === undo.removed.id) : -1
  const line = at >= 0 && undo && (
    <div key="undo">
      <UndoLine undo={undo} level={level} words={kit.words} onUndo={() => kit.onAction({ type: "undo" })} />
    </div>
  )

  const rows: ReactNode[] = protections.map((p, i) => (
    <ConditionRow key={p.id} condition={p} position={{ n: i + 1, total: protections.length }} gutter={i === 0 ? null : "or"} kit={kit} />
  ))
  if (line) rows.splice(Math.min(at, rows.length), 0, line)

  return (
    <Fieldset legend="Never touch" note={`If any of these is true, the ${NOUNS[level][0]} is safe.`}>
      <GlobalProtectionsLine level={level} protections={globals} counts={counts} kept={kept} />
      {rows.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-label font-medium text-foreground md:pl-10">This rule only</p>
          {rows}
        </div>
      )}
      <div className="md:pl-10">
        <Button
          variant="outline"
          size="sm"
          icon={<Icon icon={Plus} />}
          disabled={protections.length >= MAX_PROTECTIONS}
          onClick={() => kit.onAction({ type: "add", to: "protections" })}
          className={PHONE_ADD}
          data-testid="admin-cleanup-add-protection"
        >
          Add protection
        </Button>
      </div>
    </Fieldset>
  )
}
