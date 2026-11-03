"use client"

import { useAdminNav } from "@/components/shell/admin-nav-context"
import type { LucideIcon } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"

import { AdminNavList } from "@/components/shell/admin-nav-list"
import { Icon } from "@/components/ui/icon"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { isActive, isTabActive, mobileTabs, type AdminNavItem, type NavCounts } from "@/lib/admin/nav"
import { icons } from "@/lib/ui/icons"
import { cn } from "@/lib/utils"

const tabClasses = cn(
  "relative flex min-w-0 flex-1 flex-col items-center justify-center gap-1 text-caption font-medium text-muted-foreground",
  "before:absolute before:inset-x-3 before:top-0 before:h-0.75 before:rounded-b-sm"
)
const activeTab = "text-foreground before:bg-primary-indicator"

/** A tab's icon and label, with a destructive dot on the icon (`admin-tab-<id>-failed`) while `failed`. */
function TabContent({ id, icon, label, failed }: { id: string; icon: LucideIcon; label: string; failed: boolean }) {
  return (
    <>
      <span className="relative">
        <Icon icon={icon} size={20} />
        {failed && (
          <span className="absolute -top-0.5 -right-1 size-2 rounded-full bg-destructive" data-testid={`admin-tab-${id}-failed`} />
        )}
      </span>
      <span className="max-w-full truncate px-1">
        {label}
        {failed && <span className="sr-only">, jobs have failed</span>}
      </span>
    </>
  )
}

/**
 * Below `md`: a 64px tab bar (ui-design-system 6.2). The current tab gets
 * `aria-current="page"` and a 3px bar on its top edge. More opens the full
 * nav in a bottom Sheet, the phone's one menu. A destructive dot (an item's
 * badge with the destructive tone, such as failed jobs) sits on the link tab
 * that covers the item, or on More when no link tab does.
 */
export function AdminTabBar({ navCounts }: { navCounts: NavCounts }) {
  const pathname = usePathname() ?? "/admin"
  const [open, setOpen] = useState(false)
  const { items } = useAdminNav()
  const tabs = mobileTabs(items)
  const linked = tabs.flatMap((tab) => (tab.kind === "link" ? tab.covers : []))
  const moreActive = items.some((item) => isActive(item, pathname) && !linked.includes(item))
  const failing = (item: AdminNavItem) => item.badge?.(navCounts)?.tone === "destructive"
  const moreFailed = items.some((item) => failing(item) && !linked.includes(item))

  return (
    <nav
      aria-label="Admin tabs"
      className="fixed inset-x-0 bottom-0 z-(--z-tabbar) border-t border-border bg-background pb-[env(safe-area-inset-bottom)] md:hidden"
      data-slot="admin-tab-bar"
      data-testid="admin-tab-bar"
    >
      <ul className="flex h-16">
        {tabs.map((tab) =>
          tab.kind === "link" ? (
            <li key={tab.id} className="flex flex-1">
              <Link
                href={tab.href}
                aria-current={isTabActive(tab, pathname) ? "page" : undefined}
                data-testid={`admin-tab-${tab.id}`}
                className={cn(tabClasses, isTabActive(tab, pathname) && activeTab)}
              >
                <TabContent id={tab.id} icon={tab.icon} label={tab.label} failed={tab.covers.some(failing)} />
              </Link>
            </li>
          ) : (
            <li key={tab.id} className="flex flex-1">
              <Sheet open={open} onOpenChange={setOpen}>
                <SheetTrigger
                  className={cn(tabClasses, moreActive && activeTab)}
                  data-testid="admin-tab-more"
                >
                  <TabContent id={tab.id} icon={icons.more} label={tab.label} failed={moreFailed} />
                </SheetTrigger>
                <SheetContent side="bottom" grabber data-testid="admin-more-sheet">
                  <SheetHeader>
                    <SheetTitle>More</SheetTitle>
                  </SheetHeader>
                  <AdminNavList counts={navCounts} onNavigate={() => setOpen(false)} />
                </SheetContent>
              </Sheet>
            </li>
          )
        )}
      </ul>
    </nav>
  )
}
