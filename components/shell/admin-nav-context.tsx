"use client"

import { createContext, useContext, type ReactNode } from "react"

import { ADMIN_NAV, type AdminNavItem } from "@/lib/admin/nav"

interface AdminNavValue {
  /** The items the signed-in user may open. */
  items: readonly AdminNavItem[]
  /** True for a role with a trimmed admin area: no admin search or quick actions. */
  scoped: boolean
}

const AdminNavContext = createContext<AdminNavValue>({ items: ADMIN_NAV, scoped: false })

/** Gives the admin shell's navigation the items the user's permissions allow (the server picks the ids; icons are not serialisable, so the client resolves them). */
export function AdminNavProvider({ ids, scoped, children }: { ids: readonly string[]; scoped: boolean; children: ReactNode }) {
  const items = ADMIN_NAV.filter((item) => ids.includes(item.id))
  return <AdminNavContext value={{ items, scoped }}>{children}</AdminNavContext>
}

export function useAdminNav(): AdminNavValue {
  return useContext(AdminNavContext)
}
