"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { isNavActive, type MemberNavItem } from "@/lib/member/nav"
import { cn } from "@/lib/utils"

/** A test id from the link's path: `/` is `home`, `/rewind` is `rewind`. */
export function navTestId(item: MemberNavItem): string {
  return `member-nav-${item.href === "/" ? "home" : item.href.slice(1).replaceAll("/", "-")}`
}

/**
 * The desktop links of the member top bar. The current one gets
 * `aria-current="page"` and a 2px indicator on the bar's bottom border.
 */
export function MemberNav({ items }: { items: MemberNavItem[] }) {
  const pathname = usePathname() ?? "/"
  return (
    <nav aria-label="Main" className="hidden h-full shrink-0 md:block">
      <ul className="flex h-full items-stretch gap-1">
        {items.map((item) => {
          const active = isNavActive(item, pathname)
          return (
            <li key={item.href} className="flex">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                data-testid={navTestId(item)}
                className={cn(
                  "relative flex items-center rounded-sm px-3 text-ui font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground",
                  "after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:rounded-full",
                  active && "text-foreground after:bg-primary-indicator"
                )}
              >
                {item.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
