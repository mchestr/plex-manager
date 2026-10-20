"use client"

import { usePathname } from "next/navigation"
import type { ReactNode } from "react"

import { isAssistantHidden } from "@/lib/admin/nav"

/**
 * Renders the admin shell's chrome and assistant except on immersive routes
 * (the admin Rewind viewer, a stored generation), which draw their own. A
 * client island, because the admin layout does not re-render on client
 * navigation.
 */
export function AdminChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/admin"
  return isAssistantHidden(pathname) ? null : children
}
