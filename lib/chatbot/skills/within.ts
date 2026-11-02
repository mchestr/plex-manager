import "server-only"

import { prisma } from "@/lib/prisma"
import { createLogger } from "@/lib/utils/logger"

import { loadSkillCatalog, type SkillCatalog } from "./catalog"

/**
 * The skill catalogue for a chat turn or a skill tool call, bounded in time,
 * so a slow GitHub never stalls the assistant.
 *
 * A load that times out or fails gives `null`, and that is remembered for 30
 * seconds for the same set of active sources: a slow or unreachable GitHub
 * costs one five-second wait per 30 seconds, not one per turn. Saving or
 * refreshing any source changes the set's key, so the next call tries again
 * at once, in every web container.
 *
 * A load that loses the race is aborted, which stops it queueing more reads
 * (`./pool`), but the reads it already started run on and warm the reader's
 * caches for the next turn.
 *
 * @module lib/chatbot/skills/within
 */

const logger = createLogger("CHATBOT_SKILLS")

/**
 * How long a turn waits for the catalogue.
 * @internal
 */
export const SKILL_CATALOG_TIMEOUT_MS = 5_000
/** How long a timed-out or failed load is remembered for the same active sources. */
const CATALOG_FAILURE_TTL_MS = 30_000

let lastFailure: { key: string; at: number } | null = null

/** The active sources' ids and save times. */
async function sourcesKey(): Promise<string> {
  const rows = await prisma.skillSource.findMany({ where: { isActive: true }, select: { id: true, updatedAt: true } })
  return rows
    .map((row) => `${row.id}:${row.updatedAt.getTime()}`)
    .toSorted()
    .join(",")
}

/** {@link loadSkillCatalog}, or `null` when it takes longer than {@link SKILL_CATALOG_TIMEOUT_MS} or fails. */
async function loadBounded(): Promise<SkillCatalog | null> {
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const timedOut = new Promise<"timeout">((resolve) => {
    timer = setTimeout(() => {
      controller.abort()
      resolve("timeout")
    }, SKILL_CATALOG_TIMEOUT_MS)
  })
  try {
    // The race also handles a rejection that comes after the timeout
    const result = await Promise.race([loadSkillCatalog(controller.signal), timedOut])
    if (result !== "timeout") return result
    logger.warn("Skill catalogue unavailable", { reason: "timeout" })
  } catch (error) {
    logger.warn("Skill catalogue unavailable", { reason: "error", error: String(error) })
  } finally {
    clearTimeout(timer)
  }
  return null
}

/**
 * loadSkillCatalog, or null after SKILL_CATALOG_TIMEOUT_MS or on any error
 * (logged as a warning with the reason). A null is remembered for 30 seconds
 * for the same set of active sources, during which it returns null at once.
 */
export async function loadSkillCatalogWithin(): Promise<SkillCatalog | null> {
  let key: string
  try {
    key = await sourcesKey()
  } catch (error) {
    logger.warn("Skill catalogue unavailable", { reason: "error", error: String(error) })
    return null
  }
  if (lastFailure?.key === key && Date.now() - lastFailure.at < CATALOG_FAILURE_TTL_MS) return null

  const catalog = await loadBounded()
  if (!catalog) lastFailure = { key, at: Date.now() }
  return catalog
}
