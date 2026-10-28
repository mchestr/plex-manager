"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"

import { CommandMenuTrigger } from "@/components/admin/command-menu"
import { useAdminNav } from "@/components/shell/admin-nav-context"
import { AdminNavList } from "@/components/shell/admin-nav-list"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Wordmark } from "@/components/ui/wordmark"
import { isActive, type NavCounts } from "@/lib/admin/nav"
import { icons } from "@/lib/ui/icons"

interface AdminMobileBarProps {
  serverName: string
  navCounts: NavCounts
}

/**
 * Below `md`: a 56px top bar with the menu (the grouped nav in a right
 * Sheet), the Wordmark, the "Admin" badge, the command menu's search
 * button (P10.16) and a link to the assistant page for a user who has it.
 */
export function AdminMobileBar({ serverName, navCounts }: AdminMobileBarProps) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname() ?? "/admin"
  const assistant = useAdminNav().items.find((item) => item.id === "assistant")

  return (
    <header
      className="sticky top-0 z-(--z-sticky) flex h-14 items-center gap-2 border-b border-border bg-background px-2 md:hidden"
      data-testid="admin-mobile-bar"
    >
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger render={<Button variant="ghost" size="icon" data-testid="admin-menu-button" />}>
          <Icon icon={icons.menu} size={20} />
          <span className="sr-only">Menu</span>
        </SheetTrigger>
        <SheetContent side="right" data-testid="admin-menu-sheet">
          <SheetHeader>
            <SheetTitle>Admin</SheetTitle>
          </SheetHeader>
          <AdminNavList counts={navCounts} onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
      <Link data-testid="admin-mobile-home" href="/admin" className="flex min-w-0 items-center rounded-sm">
        <Wordmark serverName={serverName} size="sm" />
      </Link>
      <Badge variant="outline">Admin</Badge>
      <CommandMenuTrigger size="icon" className="ml-auto" data-testid="admin-command-trigger-mobile">
        <Icon icon={icons.search} size={20} />
        <span className="sr-only">Search or jump to</span>
      </CommandMenuTrigger>
      {assistant && (
        <Button
          variant="ghost"
          size="icon"
          render={<Link href={assistant.href} />}
          nativeButton={false}
          aria-current={isActive(assistant, pathname) ? "page" : undefined}
          data-testid="admin-assistant-link-mobile"
        >
          <Icon icon={icons.assistant} size={20} />
          <span className="sr-only">Assistant</span>
        </Button>
      )}
    </header>
  )
}
