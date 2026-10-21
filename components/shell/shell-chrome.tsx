"use client"

import { usePathname } from "next/navigation"
import type { ReactNode } from "react"

import { isImmersiveRoute } from "@/lib/member/nav"

/**
 * Renders the member shell's chrome except on immersive routes (every Rewind
 * page), which draw their own. A client island, because the `(app)` layout
 * does not re-render on client navigation.
 */
export function ShellChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/"
  return isImmersiveRoute(pathname) ? null : children
}
