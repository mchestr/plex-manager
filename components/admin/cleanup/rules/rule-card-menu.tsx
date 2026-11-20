"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useLayoutEffect, useRef, useState, useTransition } from "react"

import { duplicateCleanupRule, runCleanupRuleDryRun } from "@/actions/admin/cleanup-rules"
import { DeleteRuleDialog, type DialogRule, MoveToDryRunDialog, ReviewFirstDialog } from "@/components/admin/cleanup/rules/rule-dialogs"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuLinkItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Icon } from "@/components/ui/icon"
import { useToast } from "@/components/ui/toast"
import { cleanup, cleanupTurnOn } from "@/lib/admin/routes"
import { icons } from "@/lib/ui/icons"
import type { Mode } from "@/lib/validations/cleanup-vocabulary"

/** What a mode change from the menu gives the editor: it keeps its draft and sends this revision with its next save (TS 12.6). */
export interface RuleChange {
  revision: number
  mode: Mode
}

export interface RuleCardMenuProps {
  /** `card`: the Rules tab card, with "Change mode...". `editor`: the editor header, which holds Change mode as a button. */
  variant: "card" | "editor"
  rule: DialogRule
  /** The rule's titles in Leaving soon, for the dialog words. */
  leavingCount: number
  /** The job queue is set up: "Run dry run now" needs it (TS 9.5). */
  redis: boolean
  /** The test id prefix: `admin-cleanup-rule-{id}` on a card (the default), `admin-cleanup-editor` in the editor. */
  testIdPrefix?: string
  /** Each mode change, so the editor takes the new `revision` and `mode` and stays on the page with its draft. */
  onRuleChanged?: (change: RuleChange) => void
}

type OpenDialog = "dryRunMode" | "reviewFirst" | "delete" | null

const REDIS_REASON = "Redis is not set up."

/**
 * The rule menu (UX 4.1.3 item 3, UX 4.3.2, plan D8): "Run dry run now" and
 * "Duplicate", then "Change mode..." on a live card, "Switch to Review
 * first..." on an Automatic rule, a separator, "Move back to Dry run..." on
 * a live rule and "Delete rule...". The card shows a ghost icon button, the
 * editor an outline one. The three confirms are `rule-dialogs.tsx`. In the
 * editor, a mode change goes to `onRuleChanged` and the page stays, and a
 * delete opens the Rules tab.
 */
export function RuleCardMenu({ variant, rule, leavingCount, redis, testIdPrefix, onRuleChanged }: RuleCardMenuProps) {
  const prefix = testIdPrefix ?? (variant === "editor" ? "admin-cleanup-editor" : `admin-cleanup-rule-${rule.id}`)
  const toast = useToast()
  const router = useRouter()
  const trigger = useRef<HTMLButtonElement>(null)
  const [dialog, setDialog] = useState<OpenDialog>(null)
  const [pending, startAction] = useTransition()
  const live = rule.mode !== "dryRun"
  const editor = variant === "editor"

  // The router keeps a page it leaves (Activity): an open confirm closes as the page hides (TS 12.1 rule 8.2)
  useLayoutEffect(() => () => setDialog(null), [])

  const runDryRun = () =>
    startAction(async () => {
      const result = await runCleanupRuleDryRun({ ruleId: rule.id })
      if (result.success) toast.showSuccess("Dry run started")
      else toast.showError(result.error)
    })
  const duplicate = () =>
    startAction(async () => {
      const result = await duplicateCleanupRule({ ruleId: rule.id })
      if (result.success) toast.showSuccess("Rule duplicated")
      else toast.showError(result.error)
    })
  const opened = (which: OpenDialog) => (open: boolean) => setDialog(open ? which : null)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              ref={trigger}
              variant={editor ? "outline" : "ghost"}
              size={editor ? "icon" : "icon-sm"}
              aria-label={editor ? "More actions" : `More actions for ${rule.name}`}
              className="relative pointer-coarse:before:absolute pointer-coarse:before:-inset-1.75"
              data-testid={`${prefix}-menu`}
            />
          }
        >
          <Icon icon={icons.more} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuGroup>
            {!editor && <DropdownMenuLabel>{rule.name}</DropdownMenuLabel>}
            <DropdownMenuItem
              disabled={!redis || pending}
              onClick={runDryRun}
              className={redis ? undefined : "h-auto flex-col items-start gap-0 py-1.5"}
              data-testid={`${prefix}-menu-dry-run`}
            >
              Run dry run now
              {!redis && <span className="text-label text-muted-foreground">{REDIS_REASON}</span>}
            </DropdownMenuItem>
            <DropdownMenuItem disabled={pending} onClick={duplicate} data-testid={`${prefix}-menu-duplicate`}>
              Duplicate
            </DropdownMenuItem>
            {!editor && live && (
              <DropdownMenuLinkItem render={<Link href={cleanupTurnOn(rule.id)} />} data-testid={`${prefix}-menu-change-mode`}>
                Change mode...
              </DropdownMenuLinkItem>
            )}
            {rule.mode === "automatic" && (
              <DropdownMenuItem onClick={() => setDialog("reviewFirst")} data-testid={`${prefix}-menu-review-first`}>
                Switch to Review first...
              </DropdownMenuItem>
            )}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          {live && (
            <DropdownMenuItem onClick={() => setDialog("dryRunMode")} data-testid={`${prefix}-menu-dry-run-mode`}>
              Move back to Dry run...
            </DropdownMenuItem>
          )}
          <DropdownMenuItem variant="destructive" onClick={() => setDialog("delete")} data-testid={`${prefix}-menu-delete`}>
            Delete rule...
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <MoveToDryRunDialog
        rule={rule}
        leavingCount={leavingCount}
        open={dialog === "dryRunMode"}
        onOpenChange={opened("dryRunMode")}
        successFocus={trigger}
        onMoved={({ revision, mode }) => onRuleChanged?.({ revision, mode })}
      />
      <ReviewFirstDialog
        rule={rule}
        open={dialog === "reviewFirst"}
        onOpenChange={opened("reviewFirst")}
        successFocus={trigger}
        onSwitched={({ revision, mode }) => onRuleChanged?.({ revision, mode })}
      />
      <DeleteRuleDialog
        rule={rule}
        leavingCount={leavingCount}
        open={dialog === "delete"}
        onOpenChange={opened("delete")}
        onDeleted={() => {
          if (editor) router.push(cleanup())
        }}
      />
    </>
  )
}
