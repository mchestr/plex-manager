"use client"

import Link from "next/link"
import { type ReactNode, forwardRef } from "react"

export type NavItem = {
  href: string
  label: string
  icon: ReactNode
  testId: string
}

type MobileNavButtonProps = {
  item: NavItem
  isActive: boolean
}

export const MobileNavButton = forwardRef<HTMLAnchorElement, MobileNavButtonProps>(
  function MobileNavButton({ item, isActive }, ref) {
    return (
      <Link
        ref={ref}
        href={item.href}
        data-testid={`${item.testId}-mobile`}
        className={`flex flex-col items-center gap-1 px-2 py-2 rounded-lg transition-all min-w-0 flex-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900 ${
          isActive ? "text-cyan-400" : "text-slate-400"
        }`}
      >
        <div className={`transition-colors ${isActive ? "text-cyan-400" : "text-slate-500"}`}>
          {item.icon}
        </div>
        <span className="text-xs font-medium truncate w-full text-center">
          {item.label.split(" ")[0]}
        </span>
        {isActive && <div className="w-1 h-1 rounded-full bg-cyan-400"></div>}
      </Link>
    )
  }
)
