import { AdminNav } from "@/components/admin/shared/admin-nav"
import { requireAdmin } from "@/lib/admin"
import React from "react"

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await requireAdmin()

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900">
      <AdminNav />
      <main className="md:ml-64 pb-20 md:pb-6">
        {children}
      </main>
    </div>
  )
}
