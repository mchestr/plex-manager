"use client"

import { usePathname } from "next/navigation"
import type { ReactNode } from "react"

import { isAssistantHidden, isImmersive } from "@/lib/admin/nav"

interface AdminChromeProps {
  /** `assistant`: the assistant and its triggers, which also step aside on the admin Rewind preview. */
  part?: "chrome" | "assistant"
  children: ReactNode
}

/**
 * Renders the admin shell's chrome except on immersive routes (a stored
 * generation), which draw their own, and the assistant except where it is
 * hidden as well (the admin Rewind preview, P7.9). A client island, because
 * the admin layout does not re-render on client navigation.
 */
export function AdminChrome({ part = "chrome", children }: AdminChromeProps) {
  const pathname = usePathname() ?? "/admin"
  const hidden = part === "assistant" ? isAssistantHidden(pathname) : isImmersive(pathname)
  return hidden ? null : children
}
