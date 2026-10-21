"use client"

import type { LucideIcon } from "lucide-react"
import { Ellipsis } from "lucide-react"
import type { Route } from "next"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Icon } from "@/components/ui/icon"

export interface RowAction {
  id: string
  /** End a destructive label with "..." when it opens a confirm. */
  label: string
  icon?: LucideIcon
  onSelect?: () => void
  href?: Route
  /** Destructive items sit last, after a separator. */
  variant?: "default" | "destructive"
  /** Shown but not selectable, such as Delete on the row in use. */
  disabled?: boolean
}

interface RowActionsProps {
  /** The row's name: "Actions for {name}" on the button, and the menu's heading. */
  name: string
  actions: RowAction[]
  "data-testid"?: string
}

/** A row's ghost icon button and the action menu it opens, headed with the row's name. */
export function RowActions({ name, actions, ...props }: RowActionsProps) {
  const testId = props["data-testid"]
  const regular = actions.filter((action) => action.variant !== "destructive")
  const destructive = actions.filter((action) => action.variant === "destructive")

  const item = (action: RowAction) => (
    <DropdownMenuItem
      key={action.id}
      variant={action.variant}
      icon={action.icon && <Icon icon={action.icon} />}
      onClick={action.onSelect}
      disabled={action.disabled}
      render={action.href ? <Link href={action.href} /> : undefined}
      data-testid={testId && `${testId}-${action.id}`}
    >
      {action.label}
    </DropdownMenuItem>
  )

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon-sm" aria-label={`Actions for ${name}`} data-testid={testId} />}
      >
        <Icon icon={Ellipsis} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{name}</DropdownMenuLabel>
          {regular.map(item)}
        </DropdownMenuGroup>
        {destructive.length > 0 && <DropdownMenuSeparator />}
        {destructive.map(item)}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
