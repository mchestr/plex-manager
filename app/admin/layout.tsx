import type { ReactNode } from "react"

import { AdminDenial } from "@/components/shell/admin-denial"
import { AdminShell } from "@/components/shell/admin-shell"
import { PublicShell } from "@/components/shell/public-shell"
import { getAdminGate } from "@/lib/admin"
import { getAdminShellData } from "@/lib/admin/shell"
import { serverName } from "@/lib/brand"

export default async function AdminLayout({ children }: { children: ReactNode }) {
  // Rendered here, not thrown: an error.tsx does not wrap its own segment's
  // layout, and a production build hides a thrown error's name (BP-27). The
  // denial sits in PublicShell, so a non-admin never sees the sidebar.
  const gate = await getAdminGate()
  if (!gate.ok) {
    return (
      <PublicShell serverName={await serverName()}>
        <AdminDenial reason={gate.reason} />
      </PublicShell>
    )
  }

  const shell = await getAdminShellData(gate.session.user)
  return <AdminShell {...shell}>{children}</AdminShell>
}
