"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { AppearancePicker } from "@/components/account/appearance-picker"
import { AssistantTrigger } from "@/components/admin/chatbot/assistant-sheet"
import { CommandMenuKeyHint, CommandMenuTrigger } from "@/components/admin/command-menu"
import { AdminChrome } from "@/components/shell/admin-chrome"
import { useSignOut } from "@/components/shell/use-sign-out"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Icon } from "@/components/ui/icon"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Wordmark } from "@/components/ui/wordmark"
import {
  ADMIN_NAV,
  ADMIN_NAV_GROUPS,
  isActive,
  itemsIn,
  navTestId,
  type AdminNavItem,
  type NavCounts,
} from "@/lib/admin/nav"
import type { AdminShellUser } from "@/lib/admin/shell"
import { useAppearance } from "@/lib/appearance-context"
import { icons } from "@/lib/ui/icons"
import { cn } from "@/lib/utils"

const itemClasses = cn(
  "relative flex h-8 items-center justify-center gap-3 rounded-md px-2 text-ui font-medium text-sidebar-foreground lg:justify-start",
  "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
)

/** The Appearance menu beside Sign out, only while the light theme's flag is on (P10.10). */
function AppearanceMenu() {
  const { enabled } = useAppearance()
  if (!enabled) return null
  return (
    <DropdownMenu>
      <RailTip label="Appearance">
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              className="shrink-0 text-sidebar-foreground"
              aria-label="Appearance"
              data-testid="admin-appearance-trigger"
            />
          }
        >
          <Icon icon={icons.appearance} />
        </DropdownMenuTrigger>
      </RailTip>
      <DropdownMenuContent side="top" align="end" className="w-48" data-testid="admin-appearance-menu">
        <AppearancePicker variant="menu" testId="admin-appearance" />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** A rail tooltip at `md`; from `lg` the label is visible, so the tooltip is not drawn. */
function RailTip({ label, children }: { label: string; children: React.ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent side="right" className="lg:hidden">
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

function NavLink({ item, counts, pathname }: { item: AdminNavItem; counts: NavCounts; pathname: string }) {
  const active = isActive(item, pathname)
  const badge = item.badge?.(counts)
  return (
    <li>
      <RailTip label={item.label}>
        <Link
          href={item.href}
          aria-current={active ? "page" : undefined}
          data-testid={navTestId(item)}
          className={cn(
            itemClasses,
            active &&
              "bg-sidebar-accent text-sidebar-accent-foreground before:absolute before:inset-y-0 before:-left-2 before:w-0.75 before:rounded-r-sm before:bg-sidebar-primary"
          )}
        >
          <Icon icon={item.icon} />
          <span className="sr-only lg:not-sr-only lg:flex-1 lg:truncate">{item.label}</span>
          {badge && (
            <Badge variant={badge.tone ?? "neutral"} className="hidden lg:inline-flex">
              {badge.text}
            </Badge>
          )}
          {badge?.tone === "destructive" && (
            <span aria-hidden="true" className="absolute top-1 right-1 size-1.5 rounded-full bg-destructive lg:hidden" />
          )}
        </Link>
      </RailTip>
    </li>
  )
}

interface AdminSidebarProps {
  serverName: string
  user: AdminShellUser
  navCounts: NavCounts
  assistant: boolean
}

/**
 * The admin sidebar (ui-design-system 6.2): 248px from `lg`, a 56px icon rail
 * with tooltips at `md`, hidden below. The current item gets
 * `aria-current="page"`, the accent fill and a 3px strip at the left edge.
 */
export function AdminSidebar({ serverName, user, navCounts, assistant }: AdminSidebarProps) {
  const pathname = usePathname() ?? "/admin"
  const signOut = useSignOut()

  return (
    <aside
      className="sticky top-0 z-(--z-sidebar) hidden h-dvh w-14 shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex lg:w-62"
      data-testid="admin-sidebar"
    >
      <div className="flex h-14 items-center justify-center gap-2 px-2 lg:justify-start lg:px-4">
        <Link href="/admin" className="flex min-w-0 items-center rounded-sm" data-testid="admin-wordmark">
          <Wordmark serverName={serverName} className="hidden lg:flex" />
          <span aria-hidden="true" className="size-2 rounded-[2px] bg-primary lg:hidden" />
          <span className="sr-only lg:hidden">{serverName}</span>
        </Link>
        <Badge variant="outline" className="hidden lg:inline-flex">
          Admin
        </Badge>
      </div>
      <div className="px-2 pb-1">
        <RailTip label="Search or jump to">
          <CommandMenuTrigger
            variant="outline"
            size="sm"
            className="w-full justify-center gap-3 px-2 text-muted-foreground lg:justify-start"
            data-testid="admin-command-trigger"
          >
            <Icon icon={icons.search} />
            <span className="sr-only lg:not-sr-only lg:flex-1 lg:text-left">Search or jump to</span>
            <span className="hidden lg:contents">
              <CommandMenuKeyHint />
            </span>
          </CommandMenuTrigger>
        </RailTip>
      </div>
      {assistant && (
        <AdminChrome part="assistant">
          <div className="px-2 pb-2">
            <RailTip label="Assistant">
              <AssistantTrigger className="w-full justify-center gap-3 lg:justify-start" data-testid="admin-chat-toggle">
                <Icon icon={icons.assistant} />
                <span className="sr-only lg:not-sr-only">Assistant</span>
              </AssistantTrigger>
            </RailTip>
          </div>
        </AdminChrome>
      )}
      <nav aria-label="Admin" className="flex-1 overflow-y-auto px-2 py-2">
        <ul className="mb-4 flex flex-col gap-0.5">
          {itemsIn(null, ADMIN_NAV).map((item) => (
            <NavLink key={item.id} item={item} counts={navCounts} pathname={pathname} />
          ))}
        </ul>
        {ADMIN_NAV_GROUPS.map((group) => (
          <div key={group} className="mb-4 border-t border-sidebar-border pt-3 first:border-t-0 first:pt-0 lg:border-t-0 lg:pt-0">
            <h2 className="hidden px-2 pb-1 text-caption font-medium text-muted-foreground lg:block">{group}</h2>
            <ul className="flex flex-col gap-0.5" aria-label={group}>
              {itemsIn(group, ADMIN_NAV).map((item) => (
                <NavLink key={item.id} item={item} counts={navCounts} pathname={pathname} />
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <div className="flex flex-col gap-1 border-t border-sidebar-border p-2">
        <RailTip label="Back to home">
          <Link href="/" className={itemClasses} data-testid="admin-back-home">
            <Icon icon={icons.home} />
            <span className="sr-only lg:not-sr-only lg:flex-1">Back to home</span>
          </Link>
        </RailTip>
        <div className="flex flex-col items-center justify-center gap-2 px-0 py-1 lg:flex-row lg:justify-start lg:px-2">
          <span
            aria-hidden="true"
            className="hidden size-7 shrink-0 items-center justify-center rounded-full border border-border-strong bg-secondary text-caption text-secondary-foreground lg:flex"
          >
            {user.initials}
          </span>
          <span className="hidden min-w-0 flex-1 flex-col lg:flex">
            <span className="truncate text-ui font-medium text-sidebar-accent-foreground">{user.name}</span>
            <span className="text-caption text-muted-foreground">Admin</span>
          </span>
          <AppearanceMenu />
          <RailTip label="Sign out">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={signOut}
              className="shrink-0 text-sidebar-foreground"
              aria-label="Sign out"
              data-testid="admin-sign-out"
            >
              <Icon icon={icons.signOut} />
            </Button>
          </RailTip>
        </div>
      </div>
    </aside>
  )
}
