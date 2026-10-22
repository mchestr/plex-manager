/**
 * Reads for the admin history page: a legacy Rewind's stored versions.
 *
 * Server-only reads, not actions (P10.7, BP-06): the history page calls them
 * on the server and passes the versions to its picker as props. Each version is an
 * `LLMUsage` row whose response is rebuilt into a Rewind on the statistics
 * stored with the current one (statistics do not change between
 * regenerations).
 */

import "server-only"

import { assertAdmin } from "@/lib/admin"
import { prisma } from "@/lib/prisma"
import { auditMemberRead } from "@/lib/security/audit-log"
import { createLogger } from "@/lib/utils/logger"
import { assembleWrappedData } from "@/lib/wrapped/assemble-wrapped"
import { pickCurrentUsageId } from "@/lib/wrapped/data/history"
import { parseStoredRewind } from "@/lib/wrapped/data/parse-stored"
import { storedWrappedDataSchema, type StoredWrappedData } from "@/lib/wrapped/data/schema-legacy"
import { parseWrappedLLMOutput, stripCodeFences } from "@/lib/wrapped/parse-llm-output"

const logger = createLogger("ADMIN")

/**
 * Get historical wrapped versions from LLM usage records (admin only).
 *
 * The current version is the newest usage row created at or before
 * `PlexWrapped.generatedAt` ({@link pickCurrentUsageId}).
 */
export async function getHistoricalWrappedVersions(wrappedId: string) {
  const session = await assertAdmin()

  const wrapped = await prisma.plexWrapped.findUnique({
    where: { id: wrappedId },
    select: { generatedAt: true, userId: true },
  })
  if (wrapped) await auditMemberRead("rewind-history", wrapped.userId, session.user.id)

  const llmUsageRecords = await prisma.lLMUsage.findMany({
    where: {
      wrappedId,
      // Exclude empty responses. A null response is a version whose text the
      // October 2026 privacy clean-up removed (P0.20); it stays listed so the
      // admin sees the clean-up notice instead of a missing version.
      OR: [{ response: null }, { response: { not: "" } }],
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  })

  const currentId = pickCurrentUsageId(llmUsageRecords, wrapped?.generatedAt ?? null)

  return llmUsageRecords.map((record) => ({
    id: record.id,
    createdAt: record.createdAt,
    provider: record.provider,
    model: record.model,
    cost: record.cost,
    totalTokens: record.totalTokens,
    response: record.response,
    userId: record.userId,
    userName: record.user.name || record.user.email || "Unknown",
    isCurrent: record.id === currentId,
  }))
}

/** Zeroed statistics, for a version whose current Rewind is not a v1 or v2 row. */
function emptyStatistics(): StoredWrappedData["statistics"] {
  return storedWrappedDataSchema.shape.statistics.parse({})
}

/**
 * Rebuild one version from its LLM response: a v2 response (creative output)
 * goes through the v2 schema and assembly; a v1 response (the full sections
 * list) is read with the lenient legacy schema. Null when it is neither.
 */
function rebuildVersion(
  response: string,
  context: { year: number; userId: string; userName: string; generatedAt: string; statistics: StoredWrappedData["statistics"] }
): StoredWrappedData | null {
  const v2 = parseWrappedLLMOutput(response)
  if (v2.success) {
    return { ...assembleWrappedData({ output: v2.output, ...context }), generatedAt: context.generatedAt }
  }

  let json: unknown
  try {
    json = JSON.parse(stripCodeFences(response))
  } catch {
    return null
  }
  if (typeof json !== "object" || json === null || !("sections" in json)) return null
  const v1 = storedWrappedDataSchema.safeParse({ ...json, ...context })
  return v1.success ? v1.data : null
}

/**
 * Get a historical wrapped data from an LLM usage record (admin only).
 *
 * Returns `removed: true` when the October 2026 privacy clean-up removed the
 * record's response (P0.20); the page then shows the clean-up notice. Returns
 * null when the record does not exist or its response cannot be rebuilt.
 */
export async function getHistoricalWrappedData(llmUsageId: string, _wrappedId: string) {
  const session = await assertAdmin()

  const llmUsage = await prisma.lLMUsage.findUnique({
    where: { id: llmUsageId },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      wrapped: {
        select: {
          id: true,
          year: true,
          data: true,
        },
      },
    },
  })

  if (!llmUsage || !llmUsage.wrapped) {
    return null
  }
  await auditMemberRead("rewind-history", llmUsage.userId, session.user.id)

  const version = {
    year: llmUsage.wrapped.year,
    userId: llmUsage.userId,
    userName: llmUsage.user.name || llmUsage.user.email || "User",
    llmUsage: {
      id: llmUsage.id,
      createdAt: llmUsage.createdAt,
      provider: llmUsage.provider,
      model: llmUsage.model,
      cost: llmUsage.cost,
      totalTokens: llmUsage.totalTokens,
    },
  }

  if (llmUsage.response === null) {
    return { ...version, removed: true as const }
  }

  const current = parseStoredRewind(llmUsage.wrapped.data)
  const statistics = current.version === 1 || current.version === 2 ? current.legacy.statistics : emptyStatistics()

  const wrappedData = rebuildVersion(llmUsage.response, {
    year: version.year,
    userId: version.userId,
    userName: version.userName,
    generatedAt: llmUsage.createdAt.toISOString(),
    statistics,
  })
  if (!wrappedData) {
    logger.error("Failed to rebuild historical wrapped data", { llmUsageId })
    return null
  }

  return { ...version, removed: false as const, wrappedData }
}
