import { redirect } from "next/navigation"
import { Suspense } from "react"

import { PlexConnectedCard } from "@/components/setup/plex-connected-card"
import { SetupClaimStep } from "@/components/setup/setup-claim-step"
import { SetupWizard } from "@/components/setup/setup-wizard/setup-wizard"
import { requireSetupClaim } from "@/lib/setup/claim"
import { getDevDefaults } from "@/lib/setup/dev-defaults"
import { getSetupStatus } from "@/lib/setup/status"
import { getSetupWizardData } from "@/lib/setup/wizard-data"
import { parseSetupPosition, stepIndex } from "@/types/setup"

export default async function SetupPage({ searchParams }: { searchParams: Promise<{ step?: string | string[] }> }) {
  const { isComplete, currentStepId } = await getSetupStatus()

  if (isComplete) {
    redirect("/")
  }

  // Until this browser claims the server with the setup code, it sees only the claim step (P11.32)
  if (!(await requireSetupClaim()).ok) {
    return <SetupClaimStep />
  }

  // Back is `?step=`, to any step at or before the wizard's position (P10.24)
  const requested = parseSetupPosition((await searchParams).step)
  const position = requested && stepIndex(requested) <= stepIndex(currentStepId) ? requested : currentStepId

  // Read once here, so no step asks for them on mount (P10.7)
  const [devDefaults, data] = await Promise.all([getDevDefaults(), getSetupWizardData(position)])

  return (
    <SetupWizard
      key={position}
      position={position}
      reached={currentStepId}
      data={data}
      devDefaults={devDefaults}
      rail={
        data.configured.plex && position !== "plex" ? (
          <Suspense fallback={null}>
            <PlexConnectedCard />
          </Suspense>
        ) : undefined
      }
    />
  )
}
