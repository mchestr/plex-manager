import type { ReactNode } from "react"

import { PublicShell } from "@/components/shell/public-shell"
import { serverName } from "@/lib/brand"

export default async function AuthLayout({ children }: { children: ReactNode }) {
  return <PublicShell serverName={await serverName()}>{children}</PublicShell>
}
