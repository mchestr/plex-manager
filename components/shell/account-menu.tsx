"use client"

import Link from "next/link"

import { AppearancePicker } from "@/components/account/appearance-picker"
import { useSignOut } from "@/components/shell/use-sign-out"
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
import type { ShellUser } from "@/lib/member/shell"
import { icons } from "@/lib/ui/icons"

/** The 28px initials tile on the account menu trigger. */
function Avatar({ initials }: { initials: string }) {
  return (
    <span
      aria-hidden="true"
      className="flex size-7 shrink-0 items-center justify-center rounded-full border border-border-strong bg-secondary text-caption text-secondary-foreground"
    >
      {initials}
    </span>
  )
}

/**
 * The account menu (ui-design-system 6.1): the name and email, the Discord
 * link state (UI-01), Membership when it exists, Account settings,
 * Appearance (P10.10), Admin for admins and Support,
 * and Sign out.
 */
export function AccountMenu({ user }: { user: ShellUser }) {
  const signOut = useSignOut()
  const firstName = user.name.split(/\s+/)[0]

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" className="gap-2 px-1.5 md:px-2" data-testid="account-menu-trigger" />}
      >
        <Avatar initials={user.initials} />
        <span className="hidden max-w-32 truncate md:inline">{firstName}</span>
        <span className="sr-only md:hidden">Account</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64" data-testid="account-menu">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex flex-col py-2">
            <span className="truncate text-ui font-semibold text-foreground">{user.name}</span>
            {user.email && <span className="truncate">{user.email}</span>}
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        {user.discordHandle !== undefined && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLinkItem
              render={<Link href="/discord/link" />}
              icon={<Icon icon={icons.discord} />}
              data-testid="account-menu-discord"
            >
              <span className="truncate">
                {user.discordHandle ? `Discord: linked as ${user.discordHandle}` : "Link Discord"}
              </span>
            </DropdownMenuLinkItem>
          </>
        )}
        <DropdownMenuSeparator />
        {user.membership && (
          <DropdownMenuLinkItem
            render={<Link href="/membership" />}
            icon={<Icon icon={icons.membership} />}
            data-testid="account-menu-membership"
          >
            Membership
          </DropdownMenuLinkItem>
        )}
        <DropdownMenuLinkItem
          render={<Link href="/account" />}
          icon={<Icon icon={icons.settings} />}
          data-testid="account-menu-settings"
        >
          Account settings
        </DropdownMenuLinkItem>
        <DropdownMenuSeparator />
        <AppearancePicker variant="menu" testId="account-menu-appearance" />
        <DropdownMenuSeparator />
        {user.adminArea && (
          <DropdownMenuLinkItem
            render={<Link href="/admin" />}
            icon={<Icon icon={icons.owner} />}
            data-testid="admin-dashboard-link"
          >
            Admin
          </DropdownMenuLinkItem>
        )}
        <DropdownMenuItem icon={<Icon icon={icons.signOut} />} onClick={signOut} data-testid="sign-out-button">
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
