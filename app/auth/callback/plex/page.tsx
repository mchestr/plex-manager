import type { Metadata } from "next"

import { getSetupStatus } from "@/lib/setup/status"
import { redirect } from "next/navigation"
import { PlexCallbackPageClient } from "@/app/auth/callback/plex/callback-client"

export const dynamic = 'force-dynamic'

export const metadata: Metadata = { title: "Finishing sign-in" }

export default async function PlexCallbackPage() {
  // Check setup status server-side before rendering
  const { isComplete } = await getSetupStatus()

  if (!isComplete) {
    redirect("/setup")
  }

  return <PlexCallbackPageClient />
}

