/**
 * `needsApproval` of a rule's items after a mode change of a live rule (TS
 * 8.12, 6.8): an item needs an approval while one of its holding rules is in
 * Review first. Approved items stay approved. Server-only. The caller holds
 * the run claim.
 *
 * @module lib/cleanup/actions/rules/approval
 */

import "server-only"

import { prisma } from "@/lib/prisma"

/** The item states that a rule holds (every state but `deleting`). */
const HELD_STATES = ["held", "leaving", "approved"]

/**
 * Writes `needsApproval` of the items that hold `ruleId`, after the rule
 * moved to `mode`. Review first: every item needs an approval. Automatic:
 * only the items that another Review first rule also holds.
 */
export async function writeNeedsApproval(ruleId: string, mode: "reviewFirst" | "automatic"): Promise<void> {
  const where = { ruleIds: { has: ruleId }, state: { in: HELD_STATES } }
  if (mode === "reviewFirst") {
    await prisma.cleanupItem.updateMany({ where, data: { needsApproval: true } })
    return
  }
  const others = await prisma.cleanupRule.findMany({ where: { id: { not: ruleId }, mode: "reviewFirst" }, select: { id: true } })
  const reviewFirst = others.map((rule) => rule.id)
  if (reviewFirst.length === 0) {
    await prisma.cleanupItem.updateMany({ where, data: { needsApproval: false } })
    return
  }
  await prisma.cleanupItem.updateMany({ where: { ...where, NOT: { ruleIds: { hasSome: reviewFirst } } }, data: { needsApproval: false } })
  await prisma.cleanupItem.updateMany({ where: { ...where, AND: { ruleIds: { hasSome: reviewFirst } } }, data: { needsApproval: true } })
}
