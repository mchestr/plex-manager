"use server"

import { getOnboardingStatus } from "@/actions/onboarding"
import { getSetupStatus } from "@/actions/setup"
import { redirect } from "next/navigation"

export async function ensureSetupComplete() {
  const { isComplete } = await getSetupStatus()
  if (!isComplete) {
    redirect("/setup")
  }
}

export async function ensureOnboardingComplete() {
  const { isComplete } = await getOnboardingStatus()
  if (!isComplete) {
    redirect("/onboarding")
  }
}


