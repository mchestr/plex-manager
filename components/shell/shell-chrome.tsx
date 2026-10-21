"use client"

import dynamic from "next/dynamic"
import { usePathname } from "next/navigation"

import { isImmersiveRoute } from "@/lib/member/nav"

import type { AppChromeProps } from "./app-chrome"

/**
 * The bar, nav, account menu and notice, in their own chunk: a Rewind page
 * never renders them, so it never loads them either (P7.15's first-page
 * budget). Server-rendered on every other page, as before.
 */
const AppChrome = dynamic(() => import("./app-chrome").then((mod) => mod.AppChrome))

/**
 * Renders the member shell's chrome except on immersive routes (every Rewind
 * page), which draw their own. A client island, because the `(app)` layout
 * does not re-render on client navigation.
 */
export function ShellChrome(props: AppChromeProps) {
  const pathname = usePathname() ?? "/"
  return isImmersiveRoute(pathname) ? null : <AppChrome {...props} />
}
