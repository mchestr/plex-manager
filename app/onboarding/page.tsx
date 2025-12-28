import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import type { AuthService } from "@/types/onboarding"
import { getServerSession } from "next-auth"
import { redirect } from "next/navigation"

export default async function OnboardingPage() {
  const session = await getServerSession(authOptions)

  if (!session?.user?.id) {
    redirect("/")
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { primaryAuthService: true },
  })

  const service: AuthService = (user?.primaryAuthService as AuthService) || "plex"

  return <OnboardingWizard currentStep={1} service={service} />
}

