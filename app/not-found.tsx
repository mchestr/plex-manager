import type { Metadata } from "next"

import { PublicShell } from "@/components/shell/public-shell"
import { NotFoundScreen, notFoundInviteCode } from "@/components/status/not-found-screen"
import { serverName } from "@/lib/brand"

export const metadata: Metadata = { title: "Page not found" }

/** The app-wide 404: the not-found StatusScreen in PublicShell. */
export default async function NotFound() {
  const [name, inviteCode] = await Promise.all([serverName(), notFoundInviteCode()])

  return (
    <PublicShell serverName={name}>
      <NotFoundScreen inviteCode={inviteCode} />
    </PublicShell>
  )
}
