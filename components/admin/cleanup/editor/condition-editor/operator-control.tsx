"use client"

import { Segment, SegmentedControl } from "@/components/ui/segmented-control"
import type { OperatorId } from "@/lib/cleanup/engine/types"
import { anyFieldMeta } from "@/lib/cleanup/fields/catalog"
import type { FieldId } from "@/lib/validations/cleanup-vocabulary"

import { editorId, kebab } from "./editor-parts"

interface OperatorControlProps {
  field: FieldId
  value: OperatorId
  onValueChange: (op: OperatorId) => void
  /** The id of the visible "Operator" heading, which names the group (UX 11.1 item 9). */
  labelId: string
}

/**
 * The operator of a condition (UX 4.4): a `SegmentedControl` named
 * "Operator", one segment for each operator of the field, in plain words
 * ("More than", "Less than", "Never"). The arrows move the choice. A field
 * with one operator ("is") has no operator control.
 */
export function OperatorControl({ field, value, onValueChange, labelId }: OperatorControlProps) {
  const meta = anyFieldMeta(field)
  const operators: readonly OperatorId[] = meta.operators
  return (
    <SegmentedControl
      aria-labelledby={labelId}
      value={value}
      onValueChange={(next) => {
        const op = operators.find((o) => o === next)
        if (op) onValueChange(op)
      }}
      data-testid={editorId("operator")}
      className="flex w-full"
    >
      {operators.map((op) => (
        <Segment key={op} value={op} data-testid={editorId(`operator-${kebab(op)}`)} className="flex-1">
          {meta.operatorLabels[op] ?? op}
        </Segment>
      ))}
    </SegmentedControl>
  )
}
