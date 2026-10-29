"use client"

import { useAdminNav } from "@/components/shell/admin-nav-context"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useId } from "react"

import { useSignOut } from "@/components/shell/use-sign-out"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import {
  ADMIN_NAV_GROUPS,
  isActive,
  itemsIn,
  groupSlug,
  navTestId,
  type AdminNavItem,
  type NavCounts,
} from "@/lib/admin/nav"
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
 * The full grouped admin nav for the mobile sheets (the top bar's menu and
 * the tab bar's More), with Back to home and Sign out at the end.
 */
export function AdminNavList({ counts, onNavigate }: { counts: NavCounts; onNavigate: () => void }) {
  const signOut = useSignOut()
  const idPrefix = useId()
  const { items } = useAdminNav()
  const top = itemsIn(null, items)

  return (
    <nav aria-label="Admin" className="flex flex-col gap-4">
      {top.length > 0 && (
        <ul className="flex flex-col gap-1">
          {top.map((item) => (
            <Row key={item.id} item={item} counts={counts} onNavigate={onNavigate} />
          ))}
        </ul>
      )}
      {ADMIN_NAV_GROUPS.filter((group) => itemsIn(group, items).length > 0).map((group) => (
        <section key={group} aria-labelledby={`${idPrefix}-${groupSlug(group)}`}>
          <h3 id={`${idPrefix}-${groupSlug(group)}`} className="mb-1 px-3 text-caption font-medium text-muted-foreground">
            {group}
          </h3>
          <ul className="flex flex-col gap-1">
            {itemsIn(group, items).map((item) => (
              <Row key={item.id} item={item} counts={counts} onNavigate={onNavigate} />
            ))}
          </ul>
        </section>
      ))}
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
