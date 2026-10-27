"use client"

import { createContext, type ReactNode, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from "react"

import { SettingsJumpTo, SettingsNav, type SettingsGroupId, type SettingsNavItem } from "@/components/admin/settings/settings-nav"
import { SettingsDirtyProvider } from "@/components/ui/settings-section"

/** The id of the topmost section in view, so the nav can mark it `aria-current`. */
function useActiveSection(ids: string[]): [string | null, (id: string) => void] {
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

  return [active, setActive]
}

const ActiveGroupContext = createContext<SettingsGroupId>("media")

/**
 * One group of sections. Every group stays mounted so an unsaved form keeps its
 * edits and every anchor resolves; only the active group is shown.
 */
export function SettingsGroup({ id, children }: { id: SettingsGroupId; children: ReactNode }) {
  const active = useContext(ActiveGroupContext)
  return (
    <div hidden={active !== id} data-settings-group={id} className="flex min-w-0 flex-col gap-6">
      {children}
    </div>
  )
}

const groupOf = (element: Element | null) =>
  element?.closest("[data-settings-group]")?.getAttribute("data-settings-group") as SettingsGroupId | undefined

interface SettingsLayoutProps {
  items: SettingsNavItem[]
  children: ReactNode
}

/**
 * The settings page layout (ui-design-system 6.4): a 200px sticky section nav
 * beside a 760px column showing one `SettingsGroup`, and below `md` a sticky
 * "Jump to" Select. A hash, a nav link or any in-page `#anchor` link (such as
 * `#server-time-zone`) reveals the group that holds its target.
 * Sections report their dirty state here for the nav's pip.
 */
export function SettingsLayout({ items, children }: SettingsLayoutProps) {
  const [active, setActive] = useActiveSection(items.map((item) => item.id))
  const bodyRef = useRef<HTMLDivElement>(null)
  const [group, setGroup] = useState<SettingsGroupId>(items[0]?.group ?? "media")
  const [jump, setJump] = useState<{ id: string; n: number } | null>(null)

  const reveal = useCallback(
    (id: string) => {
      const target = document.getElementById(id)
      const next = groupOf(target)
      if (!next) return false
      setGroup(next)
      // The observer only sees the new group once it shows; do not leave the old section marked meanwhile
      if (items.some((item) => item.id === id)) setActive(id)
      setJump((prev) => ({ id, n: (prev?.n ?? 0) + 1 }))
      return true
    },
    [items, setActive]
  )

  const select = useCallback(
    (id: string) => {
      if (reveal(id)) window.history.replaceState(null, "", `#${id}`)
    },
    [reveal]
  )

  // After the group is shown: a hidden section cannot be scrolled to
  useEffect(() => {
    if (!jump) return
    const smooth = !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    document.getElementById(jump.id)?.scrollIntoView({
      behavior: smooth ? "smooth" : "auto",
      block: "start",
    })
  }, [jump])

  // Before paint, so a deep link does not flash the first group
  useLayoutEffect(() => {
    const fromHash = () => {
      try {
        reveal(decodeURIComponent(window.location.hash.slice(1)))
      } catch {
        // A malformed hash (`#%`) names no section
      }
    }
    fromHash()
    window.addEventListener("hashchange", fromHash)
    return () => window.removeEventListener("hashchange", fromHash)
  }, [reveal])

  // An in-page `#anchor` link in the settings, such as `#server-time-zone`, reveals its group first
  useEffect(() => {
    const body = bodyRef.current
    if (!body) return
    const onClick = (event: globalThis.MouseEvent) => {
      const id = (event.target as Element).closest("a[href^='#']")?.getAttribute("href")?.slice(1)
      if (!id || event.defaultPrevented || !reveal(id)) return
      event.preventDefault()
      window.history.pushState(null, "", `#${id}`)
    }
    body.addEventListener("click", onClick)
    return () => body.removeEventListener("click", onClick)
  }, [reveal])

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
        <SettingsJumpTo items={items} active={active} onSelect={select} />
      </div>
      <div className="hidden md:sticky md:top-6 md:block">
        <SettingsNav items={items} active={active} activeGroup={group} dirty={dirty} onSelect={select} />
      </div>
      <SettingsDirtyProvider onDirtyChange={onDirtyChange}>
        <ActiveGroupContext.Provider value={group}>
          <div ref={bodyRef} className="min-w-0">
            {children}
          </div>
        </ActiveGroupContext.Provider>
      </SettingsDirtyProvider>
    </div>
  )
}
