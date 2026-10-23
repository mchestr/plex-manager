import "server-only"

import { prisma } from "@/lib/prisma"
import { parseSetupPosition, type SetupPosition } from "@/types/setup"

/**
 * Whether first-run setup has finished, and the wizard's position (P10.24).
 * Server-only: it was a read in the `'use server'` setup module until P11.5.
 */
export async function getSetupStatus(): Promise<{ isComplete: boolean; currentStepId: SetupPosition }> {
  const setup = await prisma.setup.findFirst({
    orderBy: { createdAt: "desc" },
  })

  return {
    isComplete: setup?.isComplete ?? false,
    currentStepId: parseSetupPosition(setup?.currentStepId) ?? "plex",
  }
}
