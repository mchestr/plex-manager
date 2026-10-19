/**
 * Builds one member's v2 Rewind, for the `REWIND_GENERATE_USER` job (P2.17).
 *
 * This is the body the old in-request `generatePlexWrapped` ran, lifted out so
 * the job owns every write: it reads the configuration, collects the
 * statistics and calls the LLM, and returns the `WrappedData` without
 * touching `PlexWrapped`. Every fetch and the LLM call take `signal`, and the
 * LLM usage rows carry `generationId`. P5.9 replaces it with
 * `generateUserRewind`.
 *
 * Failures throw {@link RewindGenerationError} with a stored code.
 *
 * @module
 */

import "server-only"

import type { StructuredErrorCode } from "@/lib/llm/generate-structured"
import { prisma } from "@/lib/prisma"
import { generateWrappedWithLLM } from "@/lib/wrapped/llm"
import { memberName } from "@/lib/wrapped/member-name"
import { collectV2Statistics } from "@/lib/wrapped/pipeline/collect-v2-statistics"
import { RewindGenerationError } from "@/lib/wrapped/pipeline/generation-error"
import type { WrappedData } from "@/types/wrapped"

interface GenerateV2Input {
  userId: string
  year: number
  wrappedId: string
  generationId: string
  signal: AbortSignal
}

/** A provider error is worth another attempt; a bad answer from the model is not. */
function llmFailure(code: StructuredErrorCode | undefined): RewindGenerationError {
  if (code === "NOT_CONFIGURED") return new RewindGenerationError("NOT_CONFIGURED", { retryable: false })
  const retryable = code === undefined || code === "PROVIDER"
  return new RewindGenerationError("LLM_FAILED", { retryable })
}

/**
 * Generates the member's v2 Rewind for `year`.
 *
 * @throws RewindGenerationError: `NOT_CONFIGURED` without an active Plex or
 * Tautulli server, a member without a Plex identity, or an unconfigured LLM;
 * `TAUTULLI_USER_NOT_FOUND`, `UPSTREAM_ERROR` and `LLM_FAILED` as the steps fail
 */
export async function generateRewindV2(input: GenerateV2Input): Promise<WrappedData> {
  const { userId, year, wrappedId, generationId, signal } = input
  const startedAt = Date.now()

  const [user, plexServer, tautulli, overseerr] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true, plexUserId: true } }),
    prisma.plexServer.findFirst({ where: { isActive: true }, select: { name: true, url: true, token: true } }),
    prisma.tautulli.findFirst({ where: { isActive: true }, select: { url: true, apiKey: true } }),
    prisma.overseerr.findFirst({ where: { isActive: true }, select: { url: true, apiKey: true } }),
  ])
  if (!user?.plexUserId) throw new RewindGenerationError("TAUTULLI_USER_NOT_FOUND", { retryable: false })
  if (!plexServer || !tautulli) throw new RewindGenerationError("NOT_CONFIGURED", { retryable: false })

  const statistics = await collectV2Statistics({
    member: { plexUserId: user.plexUserId, email: user.email },
    year,
    plexServer,
    tautulli,
    overseerr,
    signal,
  })

  // The model only ever sees the member's real name or "there", and the
  // stored Rewind their name or "Viewer", never their email. The leaderboards
  // reach the prompt only; assembleWrappedData leaves them out of the stored data.
  const llmResult = await generateWrappedWithLLM({
    promptName: memberName(user) ?? "there",
    displayName: memberName(user) ?? "Viewer",
    year,
    userId,
    wrappedId,
    generationId,
    statistics,
    signal,
  })
  if (!llmResult.success || !llmResult.data) throw llmFailure(llmResult.errorCode)

  const data = llmResult.data
  data.metadata.generationTime = Math.floor((Date.now() - startedAt) / 1000)
  return data
}
