"use client"

import { Copy, ListChecks, Ungroup } from "lucide-react"
import type { FocusEventHandler, Ref } from "react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuGroup,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Icon } from "@/components/ui/icon"
import type { DraftAction } from "@/lib/cleanup/editor/draft"
import { icons } from "@/lib/ui/icons"
import { cn } from "@/lib/utils"

/** A top-level condition, a member of an any-of group, or a rule protection. */
export type MenuRowKind = "condition" | "member" | "protection"

interface ConditionMenuProps {
  id: string
  kind: MenuRowKind
  /** The other top-level conditions, by their sentence: the "Move into an any-of group with..." submenu (UX 7.4 item 2). */
  targets: readonly { id: string; sentence: string }[]
  /**
   * `row`: the desktop row menu, with Remove (UX 4.3.4 item 7). `sheet`: the
   * phone condition Sheet header (UX 4.3.8 item 2.3), whose footer keeps Remove.
   */
  variant: "row" | "sheet"
  /** False for the last condition of the rule: Remove and Turn into a protection are refused (UX 7.2 item 7). */
  canRemove: boolean
  onAction: (action: DraftAction) => void
  /** The roving tabindex of the row toolbar (UX 7.8). */
  tabIndex?: number
  onFocus?: FocusEventHandler<HTMLButtonElement>
  triggerRef?: Ref<HTMLButtonElement>
  "data-roving"?: number
}

const item = "h-auto min-h-8 py-1.5"
const twoLines = "flex-col items-start gap-0"

/** The test id base of a menu: the row's own ids, or the condition editor's in the Sheet (UX 10.2). */
function menuBase(id: string, variant: "row" | "sheet"): string {
  if (variant === "sheet") return "admin-cleanup-condition-editor-menu"
  return `${id.startsWith("p") ? "admin-cleanup-protection" : "admin-cleanup-condition"}-${id}-menu`
}

/**
 * The menu of a condition or protection row (UX 4.3.4 item 7, UX 7.4): the
 * desktop row menu and the phone condition Sheet header use it. Duplicate,
 * then "Move into an any-of group with..." (a submenu of the other top-level
 * conditions) or "Move out of the group", "Turn into a protection" or "Turn
 * into a condition", and on a row, Remove. Each item sends one draft action;
 * the builder moves focus after it (UX 7.9).
 */
export function ConditionMenu({ id, kind, targets, variant, canRemove, onAction, tabIndex, onFocus, triggerRef, ...props }: ConditionMenuProps) {
  const base = menuBase(id, variant)
  const others = targets.filter((target) => target.id !== id)
  const noun = kind === "protection" ? "protection" : "condition"
  const sheet = variant === "sheet"

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            ref={triggerRef}
            variant="ghost"
            size={sheet ? "icon" : "icon-sm"}
            aria-label={`More actions for this ${noun}`}
            tabIndex={tabIndex}
            onFocus={onFocus}
            data-roving={props["data-roving"]}
            className={cn("text-muted-foreground", sheet && "size-11")}
            data-testid={base}
          />
        }
      >
        <Icon icon={icons.more} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 max-w-[calc(100vw-2rem)]">
        <DropdownMenuItem icon={<Icon icon={Copy} />} onClick={() => onAction({ type: "duplicate", id })} data-testid={`${base}-duplicate`}>
          Duplicate
        </DropdownMenuItem>
        {kind === "condition" && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger disabled={others.length === 0} icon={<Icon icon={icons.group} />} className={item} data-testid={`${base}-group`}>
              <span className={cn("flex min-w-0 flex-1", twoLines)}>
                <span>Move into an any-of group with...</span>
                {!sheet && <span className="text-label text-muted-foreground">Choose another condition. Both go into a new group.</span>}
              </span>
            </DropdownMenuSubTrigger>
            <DropdownMenuContent side="inline-end" align="start" sideOffset={-4} className="w-72 max-w-[calc(100vw-2rem)]">
              <DropdownMenuGroup>
                <DropdownMenuLabel>Group with</DropdownMenuLabel>
                {others.map((target) => (
                  <DropdownMenuItem
                    key={target.id}
                    className={item}
                    onClick={() => onAction({ type: "groupWith", id, targetId: target.id })}
                    data-testid={`${base}-group-${target.id}`}
                  >
                    {target.sentence}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenuSub>
        )}
        {kind === "member" && (
          <DropdownMenuItem icon={<Icon icon={Ungroup} />} onClick={() => onAction({ type: "moveOut", id })} data-testid={`${base}-ungroup`}>
            Move out of the group
          </DropdownMenuItem>
        )}
        {kind === "protection" ? (
          <DropdownMenuItem icon={<Icon icon={ListChecks} />} onClick={() => onAction({ type: "toCondition", id })} data-testid={`${base}-condition`}>
            Turn into a condition
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem
            icon={<Icon icon={icons.keep} />}
            disabled={!canRemove}
            className={item}
            onClick={() => onAction({ type: "toProtection", id })}
            data-testid={`${base}-protection`}
          >
            <span className={cn("flex", twoLines)}>
              <span>Turn into a protection</span>
              {!sheet && <span className="text-label text-muted-foreground">Moves it to Never touch with the same values.</span>}
            </span>
          </DropdownMenuItem>
        )}
        {!sheet && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              icon={<Icon icon={icons.delete} />}
              disabled={!canRemove}
              onClick={() => onAction({ type: "remove", id })}
              data-testid={`${base}-remove`}
            >
              Remove
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
