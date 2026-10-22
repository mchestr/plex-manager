"use client"

import { type ReactNode, useCallback, useEffect, useState } from "react"

import { SettingsJumpTo, SettingsNav, type SettingsNavItem } from "@/components/admin/settings/settings-nav"
import { SettingsDirtyProvider } from "@/components/ui/settings-section"

/** The id of the topmost section in view, so the nav can mark it `aria-current`. */
function useActiveSection(ids: string[]): string | null {
  const [active, setActive] = useState<string | null>(ids[0] ?? null)
  const key = ids.join(",")

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return
    const visible = new Set<string>()
    const order = key.split(",")
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id)
          else visible.delete(entry.target.id)
        }
        const first = order.find((id) => visible.has(id))
        if (first) setActive(first)
      },
      // The band under the sticky bars where a section counts as "the one you are reading"
      { rootMargin: "-96px 0px -55% 0px" }
    )
    for (const id of order) {
      const element = document.getElementById(id)
      if (element) observer.observe(element)
    }
    return () => observer.disconnect()
  }, [key])

  return active
}

interface SettingsLayoutProps {
  items: SettingsNavItem[]
  children: ReactNode
}

/**
 * The settings page layout (ui-design-system 6.4): a 200px sticky section nav
 * beside a 760px column of sections, and below `md` a sticky "Jump to" Select.
 * Sections report their dirty state here for the nav's pip.
 */
export function SettingsLayout({ items, children }: SettingsLayoutProps) {
  const active = useActiveSection(items.map((item) => item.id))
  const [dirty, setDirty] = useState<ReadonlySet<string>>(() => new Set())

  const onDirtyChange = useCallback((id: string, isDirty: boolean) => {
    setDirty((prev) => {
      if (prev.has(id) === isDirty) return prev
      const next = new Set(prev)
      if (isDirty) next.add(id)
      else next.delete(id)
      return next
    })
  }, [])

  return (
    <div className="flex flex-col gap-6 md:grid md:grid-cols-[200px_minmax(0,760px)] md:items-start md:gap-8" data-testid="settings-layout">
      <div className="sticky top-14 z-(--z-sticky) -mx-4 border-b bg-background px-4 py-2 sm:-mx-6 sm:px-6 md:hidden">
        <SettingsJumpTo items={items} active={active} />
      </div>
      <div className="hidden md:sticky md:top-6 md:block">
        <SettingsNav items={items} active={active} dirty={dirty} />
      </div>
      <SettingsDirtyProvider onDirtyChange={onDirtyChange}>
        <div className="flex min-w-0 flex-col gap-6">{children}</div>
      </SettingsDirtyProvider>
    </div>
  )
}
