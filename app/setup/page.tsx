import { redirect } from "next/navigation"
import { getSetupStatus } from "@/lib/setup/status"
import { SetupClaimForm } from "@/components/setup/setup-claim-form"
import { SetupWizard } from "@/components/setup/setup-wizard/setup-wizard"
import { requireSetupClaim } from "@/lib/setup/claim"
import { getDevDefaults } from "@/lib/setup/dev-defaults"

export const dynamic = 'force-dynamic'

export default async function SetupPage() {
  const { isComplete, currentStep } = await getSetupStatus()

  if (isComplete) {
    redirect("/")
  }

  // Until this browser claims the server with the setup code, it sees only the claim form (P11.32)
  if (!(await requireSetupClaim()).ok) {
    return <SetupClaimForm />
  }

  // Read once here, so no step asks for them on mount (P10.7)
  const devDefaults = await getDevDefaults()

  return <SetupWizard currentStep={currentStep} devDefaults={devDefaults} />
}
