"use client"

import { createContext, useContext, type ReactNode } from "react"

import { ADMIN_NAV, type AdminNavItem } from "@/lib/admin/nav"
import type { AdminShellNavEntry } from "@/lib/admin/shell"

interface AdminNavValue {
  /** The items the signed-in user may open, each at the user's own href and with only the tabs (`children`) the user may open. */
  items: readonly AdminNavItem[]
  /** True for a role with a trimmed admin area: no admin search or quick actions. */
  scoped: boolean
}

const AdminNavContext = createContext<AdminNavValue>({ items: ADMIN_NAV, scoped: false })

/**
 * Gives the admin shell's navigation the items the user's permissions allow.
 * The server sends each item's id, its href as `navFor` resolved it and the
 * ids of its tabs the user may open; icons are not serialisable, so the client
 * rebuilds each item from `ADMIN_NAV` by id and applies the server's href and
 * tab filter. A role's folded item therefore opens on its first permitted tab
 * here too, and the command menu lists only the tabs the role may open.
 */
export function AdminNavProvider({ nav, scoped, children }: { nav: readonly AdminShellNavEntry[]; scoped: boolean; children: ReactNode }) {
  const items = ADMIN_NAV.flatMap((base) => {
    const entry = nav.find(({ id }) => id === base.id)
    if (!entry) return []
    return [{ ...base, href: entry.href, children: base.children?.filter((child) => entry.childIds.includes(child.id)) }]
  })
  return <AdminNavContext value={{ items, scoped }}>{children}</AdminNavContext>
}

export function useAdminNav(): AdminNavValue {
  return useContext(AdminNavContext)
}
