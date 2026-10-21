"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState } from "react"

import { navTestId } from "@/components/shell/member-nav"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { isNavActive, type MemberNavItem } from "@/lib/member/nav"
import { icons } from "@/lib/ui/icons"
import { cn } from "@/lib/utils"

const linkClasses =
  "flex h-11 items-center rounded-md px-3 text-body font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground"

/** Below `md`: a menu button that opens a right Sheet with the top bar's links (ui-design-system 6.1). */
export function MobileNav({ items, isAdmin }: { items: MemberNavItem[]; isAdmin: boolean }) {
  const pathname = usePathname() ?? "/"
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={<Button variant="ghost" size="icon" className="md:hidden" data-testid="member-menu-button" />}
      >
        <Icon icon={icons.menu} size={20} />
        <span className="sr-only">Menu</span>
      </SheetTrigger>
      <SheetContent side="right" data-testid="member-menu-sheet">
        <SheetHeader>
          <SheetTitle>Menu</SheetTitle>
        </SheetHeader>
        <nav aria-label="Main">
          <ul className="flex flex-col gap-1">
            {items.map((item) => {
              const active = isNavActive(item, pathname)
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={close}
                    aria-current={active ? "page" : undefined}
                    data-testid={`${navTestId(item)}-mobile`}
                    className={cn(linkClasses, active && "bg-accent text-foreground")}
                  >
                    {item.label}
                  </Link>
                </li>
              )
            })}
            {isAdmin && (
              <li>
                <Link href="/admin" onClick={close} className={linkClasses} data-testid="member-menu-admin">
                  Admin
                </Link>
              </li>
            )}
          </ul>
        </nav>
      </SheetContent>
    </Sheet>
  )
}
