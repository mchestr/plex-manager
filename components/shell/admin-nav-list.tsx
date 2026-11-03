"use client"

import { useAdminNav } from "@/components/shell/admin-nav-context"
import Link from "next/link"
import { usePathname } from "next/navigation"

import { useSignOut } from "@/components/shell/use-sign-out"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { isActive, navTestId, type AdminNavItem, type NavCounts } from "@/lib/admin/nav"
import { icons } from "@/lib/ui/icons"
import { cn } from "@/lib/utils"

const rowClasses =
  "flex h-11 w-full items-center gap-3 rounded-md px-3 text-body font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground"

function Row({ item, counts, onNavigate }: { item: AdminNavItem; counts: NavCounts; onNavigate: () => void }) {
  const pathname = usePathname() ?? "/admin"
  const active = isActive(item, pathname)
  const badge = item.badge?.(counts)
  return (
    <li>
      <Link
        href={item.href}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        data-testid={`${navTestId(item)}-mobile`}
        className={cn(rowClasses, active && "bg-accent text-foreground")}
      >
        <Icon icon={item.icon} size={20} />
        <span className="flex-1 truncate">{item.label}</span>
        {badge && (
          <Badge variant={badge.tone ?? "neutral"} data-testid={`${navTestId(item)}-mobile-badge`}>
            {badge.text}
          </Badge>
        )}
      </Link>
    </li>
  )
}

/**
 * The full admin nav for the tab bar's More sheet, the one phone menu: every
 * item in nav order as one list, with Back to home and Sign out at the end.
 */
export function AdminNavList({ counts, onNavigate }: { counts: NavCounts; onNavigate: () => void }) {
  const signOut = useSignOut()
  const { items } = useAdminNav()

  return (
    <nav aria-label="Admin" className="flex flex-col gap-4">
      <ul className="flex flex-col gap-1">
        {items.map((item) => (
          <Row key={item.id} item={item} counts={counts} onNavigate={onNavigate} />
        ))}
      </ul>
      <ul className="flex flex-col gap-1 border-t border-border pt-3">
        <li>
          <Link href="/" onClick={onNavigate} className={rowClasses} data-testid="admin-back-home-mobile">
            <Icon icon={icons.home} size={20} />
            Back to home
          </Link>
        </li>
        <li>
          <Button variant="ghost" onClick={signOut} className={cn(rowClasses, "justify-start")} data-testid="admin-sign-out-mobile">
            <Icon icon={icons.signOut} size={20} />
            Sign out
          </Button>
        </li>
      </ul>
    </nav>
  )
}
