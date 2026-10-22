import type { Metadata } from "next"

import { NotFoundScreen, notFoundInviteCode } from "@/components/status/not-found-screen"

export const metadata: Metadata = { title: "Page not found" }

/** A member page's `notFound()`: the 404 inside AppShell's one main, not a second shell. */
export default async function NotFound() {
  return <NotFoundScreen inviteCode={await notFoundInviteCode()} />
}
