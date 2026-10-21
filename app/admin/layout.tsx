import type { ReactNode } from "react"

import { UnauthenticatedError } from "@/components/admin/shared/unauthenticated-error"
import { UnauthorizedError } from "@/components/admin/shared/unauthorized-error"
import { AdminShell } from "@/components/shell/admin-shell"
import { getAdminGate } from "@/lib/admin"
import { getAdminShellData } from "@/lib/admin/shell"

export default async function AdminLayout({ children }: { children: ReactNode }) {
  // Rendered here, not thrown: an error.tsx does not wrap its own segment's
  // layout, and a production build hides a thrown error's name (BP-27). The
  // denial sits outside the shell, so a non-admin never sees the sidebar.
  const gate = await getAdminGate()
  if (!gate.ok) {
    return (
      <main id="main" tabIndex={-1} className="outline-none">
        {gate.reason === "unauthenticated" ? <UnauthenticatedError /> : <UnauthorizedError />}
      </main>
    )
  }

  const shell = await getAdminShellData(gate.session.user)
  return <AdminShell {...shell}>{children}</AdminShell>
}
