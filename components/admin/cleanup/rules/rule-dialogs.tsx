"use client"

import type { RefObject } from "react"

import { deleteCleanupRule, moveCleanupRuleToDryRun, setCleanupRuleReviewFirst } from "@/actions/admin/cleanup-rules"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { useToast } from "@/components/ui/toast"
import { nounWord } from "@/lib/cleanup/fields/words"
import type { DeleteCleanupRuleResult, MoveCleanupRuleToDryRunResult, SetCleanupRuleReviewFirstResult } from "@/lib/cleanup/types/actions"
import { useFormat } from "@/lib/format-context"
import type { BoundFormat } from "@/lib/utils/format"
import type { Level, Mode } from "@/lib/validations/cleanup-vocabulary"

/** The rule that a dialog names. */
export interface DialogRule {
  id: string
  name: string
  level: Level
  mode: Mode
}

interface RuleDialogProps {
  rule: DialogRule
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Where focus goes after a success, such as the menu button that stays on the page. */
  successFocus?: RefObject<HTMLElement | null>
}

/** "Its 21 shows leave Leaving soon, unless another rule holds them." Nothing with no title in Leaving soon. */
function leaveLine(count: number, level: Level, f: BoundFormat): string | null {
  return count > 0 ? `Its ${f.number(count)} ${nounWord(count, level)} leave Leaving soon, unless another rule holds them.` : null
}

const sentence = (...parts: (string | null)[]) => parts.filter(Boolean).join(" ")

interface MoveToDryRunDialogProps extends RuleDialogProps {
  /** The rule's titles in Leaving soon (`leaving` or `approved`). */
  leavingCount: number
  /** Due titles that stay through another live rule, which deletes them at the next nightly run (UX 8.6). */
  dueElsewhere?: { count: number; ruleName: string } | null
  onMoved?: (result: MoveCleanupRuleToDryRunResult) => void
}

/**
 * "Move {rule} back to Dry run?" (UX 8.6, 7.13): a `ConfirmDialog` for the
 * rule card, the editor menu and the entry batch card. Its titles leave
 * Leaving soon unless another rule holds them, and nothing is deleted.
 */
export function MoveToDryRunDialog({ rule, leavingCount, dueElsewhere, onMoved, ...dialog }: MoveToDryRunDialogProps) {
  const f = useFormat()
  const toast = useToast()
  const one = dueElsewhere?.count === 1
  const due = dueElsewhere && dueElsewhere.count > 0
    ? `${f.number(dueElsewhere.count)} ${nounWord(dueElsewhere.count, rule.level)} ${one ? "is due and stays" : "are due and stay"} in Leaving soon ` +
      `through ${dueElsewhere.ruleName}. It deletes ${one ? "it" : "them"} at the next nightly run, inside the budget.`
    : null
  return (
    <ConfirmDialog
      {...dialog}
      title={`Move ${rule.name} back to Dry run?`}
      description={sentence(leaveLine(leavingCount, rule.level, f), leavingCount > 0 ? "Members see them go." : null, "Nothing is deleted. Dry runs continue.", due)}
      confirmLabel="Move to Dry run"
      pendingLabel="Moving"
      action={async () => {
        const result = await moveCleanupRuleToDryRun({ ruleId: rule.id })
        if (!result.success) return { error: result.error }
        toast.showSuccess("Rule moved to Dry run")
        onMoved?.(result.data)
        return {}
      }}
      data-testid="admin-cleanup-dry-run-mode-dialog"
      confirmTestId="admin-cleanup-dry-run-mode-confirm"
    />
  )
}

interface ReviewFirstDialogProps extends RuleDialogProps {
  onSwitched?: (result: SetCleanupRuleReviewFirstResult) => void
}

/** "Switch {rule} to Review first?" (UX 8.6): only on Automatic rules. A Dry run rule turns on through its review page. */
export function ReviewFirstDialog({ rule, onSwitched, ...dialog }: ReviewFirstDialogProps) {
  const toast = useToast()
  return (
    <ConfirmDialog
      {...dialog}
      title={`Switch ${rule.name} to Review first?`}
      description="Items keep their leave dates. At each leave date, the batch waits for your approval."
      confirmLabel="Switch to Review first"
      pendingLabel="Switching"
      action={async () => {
        const result = await setCleanupRuleReviewFirst({ ruleId: rule.id })
        if (!result.success) return { error: result.error }
        toast.showSuccess("Mode changed")
        onSwitched?.(result.data)
        return {}
      }}
      data-testid="admin-cleanup-review-first-dialog"
      confirmTestId="admin-cleanup-review-first-confirm"
    />
  )
}

interface DeleteRuleDialogProps extends RuleDialogProps {
  /** The rule's titles in Leaving soon. */
  leavingCount: number
  onDeleted?: (result: DeleteCleanupRuleResult) => void
}

/** "Delete the rule {rule}?" (UX 8.6): destructive. Its runs and deleted titles stay in History. */
export function DeleteRuleDialog({ rule, leavingCount, onDeleted, ...dialog }: DeleteRuleDialogProps) {
  const f = useFormat()
  const toast = useToast()
  const description = rule.mode === "dryRun"
    ? "Its dry runs stay in History."
    : sentence(leaveLine(leavingCount, rule.level, f), "Its runs and deleted titles stay in History.")
  return (
    <ConfirmDialog
      {...dialog}
      tone="destructive"
      title={`Delete the rule ${rule.name}?`}
      description={description}
      confirmLabel="Delete rule"
      pendingLabel="Deleting"
      action={async () => {
        const result = await deleteCleanupRule({ ruleId: rule.id })
        if (!result.success) return { error: result.error }
        toast.showSuccess("Rule deleted")
        onDeleted?.(result.data)
        return {}
      }}
      data-testid="admin-cleanup-delete-rule-dialog"
      confirmTestId="admin-cleanup-delete-rule-confirm"
    />
  )
}
