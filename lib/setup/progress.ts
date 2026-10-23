/**
 * The wizard's position (P10.24): every save and Skip moves it to the later
 * of where it is and the step after the one saved, so saving again after
 * Back never moves progress backwards.
 *
 * @module lib/setup/progress
 */

import "server-only"

import type { PrismaTransactionClient } from "@/lib/prisma"
import { nextStepId, parseSetupPosition, stepIndex, type SetupPosition, type SetupStepId } from "@/types/setup"

/** The wizard's row and position, or null before its first save. */
export async function wizardRow(tx: PrismaTransactionClient): Promise<{ id: string; position: SetupPosition } | null> {
  const setup = await tx.setup.findFirst({ orderBy: { createdAt: "desc" } })
  return setup && { id: setup.id, position: parseSetupPosition(setup.currentStepId) ?? "plex" }
}

/**
 * Moves the wizard past `from`: to `nextStepId(from)`, unless it is already
 * further on (a save after Back). Creates the row on the first save.
 */
export async function advanceSetup(tx: PrismaTransactionClient, from: SetupStepId) {
  const next = nextStepId(from)
  const setup = await wizardRow(tx)
  if (!setup) {
    await tx.setup.create({ data: { currentStepId: next } })
  } else if (stepIndex(next) > stepIndex(setup.position)) {
    await tx.setup.update({ where: { id: setup.id }, data: { currentStepId: next } })
  }
}
