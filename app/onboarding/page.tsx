import type { Metadata } from "next"
import { getServerSession } from "next-auth"
import { redirect } from "next/navigation"

import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard"
import { authOptions } from "@/lib/auth"
import { getOnboardingData } from "@/lib/member/onboarding"

export const dynamic = "force-dynamic"

export const metadata: Metadata = { title: "Get set up" }

/**
 * Member onboarding (P10.23). The service, server name, request URL and
 * Discord state are read here, so the first step renders with real props.
 * The Discord link flow comes back with a `discord_*` flash, which reopens
 * the Support step.
 */
export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ flash?: string | string[] }>
}) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect("/")

  const [data, query] = await Promise.all([getOnboardingData(session.user.id), searchParams])
  const flash = typeof query.flash === "string" ? query.flash : ""

  return <OnboardingWizard data={data} initialStepId={flash.startsWith("discord_") ? "support" : "welcome"} />
}
