import { redirect } from "next/navigation"
import { getSetupStatus } from "@/actions/setup"
import { SetupWizard } from "@/components/setup/setup-wizard/setup-wizard"
import { getDevDefaults } from "@/lib/setup/dev-defaults"

export const dynamic = 'force-dynamic'

export default async function SetupPage() {
  const { isComplete, currentStep } = await getSetupStatus()

  if (isComplete) {
    redirect("/")
  }

  // Read once here, so no step asks for them on mount (P10.7)
  const devDefaults = await getDevDefaults()

  return <SetupWizard currentStep={currentStep} devDefaults={devDefaults} />
}

