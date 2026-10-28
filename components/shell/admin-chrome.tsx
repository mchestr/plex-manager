"use client"

import { usePathname } from "next/navigation"
import type { ReactNode } from "react"

import { isImmersive } from "@/lib/admin/nav"

/**
 * Renders the admin shell's chrome except on immersive routes (a stored
 * generation), which draw their own. A client island, because the admin
 * layout does not re-render on client navigation.
 */
export function AdminChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/admin"
  return isImmersive(pathname) ? null : children
}
