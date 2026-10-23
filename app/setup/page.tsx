import { redirect } from "next/navigation"
import { getSetupStatus } from "@/lib/setup/status"
import { SetupClaimForm } from "@/components/setup/setup-claim-form"
import { SetupWizard } from "@/components/setup/setup-wizard/setup-wizard"
import { requireSetupClaim } from "@/lib/setup/claim"
import { getDevDefaults } from "@/lib/setup/dev-defaults"
import { parseSetupPosition, stepIndex } from "@/types/setup"

export const dynamic = 'force-dynamic'

export default async function SetupPage({ searchParams }: { searchParams: Promise<{ step?: string | string[] }> }) {
  const { isComplete, currentStepId } = await getSetupStatus()

  if (isComplete) {
    redirect("/")
  }

  // Until this browser claims the server with the setup code, it sees only the claim form (P11.32)
  if (!(await requireSetupClaim()).ok) {
    return <SetupClaimForm />
  }

  // Read once here, so no step asks for them on mount (P10.7)
  const devDefaults = await getDevDefaults()

  // Back is `?step=`, to any step at or before the wizard's position (P10.24)
  const requested = parseSetupPosition((await searchParams).step)
  const position = requested && stepIndex(requested) <= stepIndex(currentStepId) ? requested : currentStepId

  return <SetupWizard key={position} position={position} devDefaults={devDefaults} />
}
