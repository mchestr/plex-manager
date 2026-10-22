import "server-only"

import { prisma } from "@/lib/prisma"

/**
 * Whether first-run setup has finished, and the wizard's step. Server-only:
 * it was a read in the `'use server'` setup module until P11.5.
 */
export async function getSetupStatus() {
  const setup = await prisma.setup.findFirst({
    orderBy: { createdAt: "desc" },
  })

  return {
    isComplete: setup?.isComplete ?? false,
    currentStep: setup?.currentStep ?? 1,
  }
}
