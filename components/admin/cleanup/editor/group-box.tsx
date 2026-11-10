"use client"

import { Plus } from "lucide-react"
import type { ReactNode } from "react"

import { HeldText, type RowKit } from "@/components/admin/cleanup/editor/condition-box"
import { ConditionRow } from "@/components/admin/cleanup/editor/condition-row"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Icon } from "@/components/ui/icon"
import { MAX_GROUP } from "@/lib/cleanup/editor/draft-ops"
import { icons } from "@/lib/ui/icons"
import type { DraftGroup } from "@/lib/validations/cleanup-draft"

/** The notice of a group with one condition (UX 7.4 item 5). */
export const ONE_CONDITION_NOTICE = "Add a second condition. With one, the group works like a normal condition, and Save stores it as one."

/** The reason on a group's remove button when it holds every condition of the rule. */
const LAST_GROUP_REASON = "A rule needs at least one condition"

interface GroupBoxProps {
  group: DraftGroup
  /** The 1-based number of the group's first condition among the condition rows. */
  first: number
  kit: RowKit
  /** "and" before every clause but the first. */
  gutter: "and" | null
  /** The Undo line of a member removed from this group, and the member place it takes. */
  undo?: { at: number; line: ReactNode } | null
}

/**
 * An any-of group (UX 4.3.4 item 8, UX 7.4): a bordered box, `role="group"`,
 * named "Any of these, 2 conditions. One of them must be true." Its header
 * holds the title, its held-back text, its menu (Ungroup, Remove group) and
 * its remove button. On a phone they stay in the header, outside the
 * condition boxes. Rows inside use "or". With one condition it shows the
 * notice of UX 7.4 item 5. "Add to this group" closes the box.
 */
export function GroupBox({ group, first, kit, gutter, undo }: GroupBoxProps) {
  const { id, conditions } = group
  const base = `admin-cleanup-group-${id}`
  const size = conditions.length
  const held = kit.held.get(id)
  const error = kit.errors.get(id)
  const canRemove = kit.conditionCount - size > 0
  const words = size === 1 ? "1 condition" : `${size} conditions`

  const rows = conditions.map((condition, i) => (
    <ConditionRow
      key={condition.id}
      condition={condition}
      position={{ n: first + i, total: kit.conditionCount, inGroup: true }}
      gutter={i === 0 ? null : "or"}
      kit={kit}
    />
  ))
  if (undo) rows.splice(Math.min(undo.at, rows.length), 0, <div key="undo">{undo.line}</div>)

  return (
    <div className="flex flex-col gap-1 md:flex-row md:gap-2" data-slot="condition-group">
      {gutter && (
        <span aria-hidden="true" className="pl-1 text-label text-muted-foreground italic md:w-8 md:shrink-0 md:pt-3 md:pl-0 md:text-right">
          {gutter}
        </span>
      )}
      {!gutter && <span aria-hidden="true" className="hidden w-8 shrink-0 md:block" />}
      <div
        role="group"
        aria-label={`Any of these, ${words}. One of them must be true.`}
        className="flex min-w-0 flex-1 flex-col gap-2 rounded-lg border border-border-strong p-3"
        data-testid={base}
      >
        <div className="flex items-start gap-2">
          <p tabIndex={-1} data-group-title={id} className="flex min-w-0 flex-1 flex-col gap-0.5 text-ui outline-none md:flex-row md:items-baseline md:gap-2">
            <span>
              <span className="font-semibold">Any of these is true</span>{" "}
              <span className="text-muted-foreground">({size === 1 ? words : `at least 1 of ${size}`})</span>
            </span>
            {held !== undefined && (
              <span className="text-caption text-muted-foreground md:ml-auto" data-testid={`${base}-held`}>
                <HeldText held={{ count: held, kind: "more" }} />
              </span>
            )}
          </p>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="More actions for this group"
                  className="text-muted-foreground"
                  data-testid={`${base}-menu`}
                />
              }
            >
              <Icon icon={icons.more} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => kit.onAction({ type: "ungroup", groupId: id })} data-testid={`${base}-menu-ungroup`}>
                Ungroup
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                disabled={!canRemove}
                onClick={() => kit.onAction({ type: "remove", id })}
                data-testid={`${base}-menu-remove`}
              >
                Remove group
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Remove group"
            aria-describedby={canRemove ? undefined : `${base}-reason`}
            disabled={!canRemove}
            focusableWhenDisabled
            onClick={() => kit.onAction({ type: "remove", id })}
            className="text-muted-foreground"
            data-testid={`${base}-remove`}
          >
            <Icon icon={icons.close} />
          </Button>
          {!canRemove && (
            <span id={`${base}-reason`} className="sr-only">
              {LAST_GROUP_REASON}
            </span>
          )}
        </div>
        <div className="flex flex-col gap-2">{rows}</div>
        {(size === 1 || error) && (
          <p className={error ? "text-label text-destructive" : "text-label text-warning"} data-testid={`${base}-notice`}>
            {error ?? ONE_CONDITION_NOTICE}
          </p>
        )}
        <Button
          variant="ghost"
          size="sm"
          icon={<Icon icon={Plus} />}
          disabled={size >= MAX_GROUP}
          onClick={() => kit.onAction({ type: "addToGroup", groupId: id })}
          className="self-start md:ml-10 max-md:h-11 max-md:self-center"
          data-testid={`${base}-add`}
        >
          Add to this group
        </Button>
      </div>
    </div>
  )
}
