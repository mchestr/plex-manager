"use client"

import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useCallback } from "react"

import { type ParamPatch, tableHref } from "@/lib/ui/table-params"

/**
 * Writes a patch into the query string with `router.replace(..., { scroll: false })`,
 * keeping every other param. The admin list composites share it.
 */
export function useReplaceParams() {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const replace = useCallback(
    (patch: ParamPatch) => {
      router.replace(tableHref(pathname, new URLSearchParams(searchParams.toString()), patch), { scroll: false })
    },
    [router, pathname, searchParams]
  )

  return { searchParams, replace }
}
