"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { adminAction } from "@/lib/actions/define-action"
import { fail, ok } from "@/lib/actions/result"
import { API_TOKEN_EXPIRIES, apiTokenExpiry } from "@/lib/mcp/token-expiry"
import { generateToken } from "@/lib/mcp/tokens"
import { prisma } from "@/lib/prisma"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"
import { recordIdSchema } from "@/lib/validations/params"

/** An admin may hold this many live tokens at once. */
const MAX_LIVE_TOKENS = 10

/**
 * Makes a personal API token for the MCP endpoint (docs/mcp.md). The token is
 * in this result only: the database keeps its hash. Not an MCP tool, so a
 * token cannot mint another.
 */
export const createApiToken = adminAction({
  input: z.object({
    name: z.string().trim().min(1, "Name the token").max(60),
    expiresIn: z.enum(API_TOKEN_EXPIRIES).default("90d"),
  }),
  rateLimit: { name: "admin:api-tokens" },
  fallbackError: "Could not make the token",
  handler: async ({ name, expiresIn }, { userId }) => {
    const now = new Date()
    const live = await prisma.apiToken.count({
      where: { userId, revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
    })
    if (live >= MAX_LIVE_TOKENS) {
      return fail("CONFLICT", `You have ${MAX_LIVE_TOKENS} tokens. Revoke one first.`)
    }
    const { token, tokenHash, prefix } = generateToken()
    const row = await prisma.apiToken.create({
      data: { userId, name, tokenHash, prefix, expiresAt: apiTokenExpiry(expiresIn, now) },
      select: { id: true },
    })
    logAuditEvent(AuditEventType.API_TOKEN_CREATED, userId, { credentialId: row.id, expiresIn })
    revalidatePath("/admin/settings")
    return ok({ id: row.id, token })
  },
})

/** Revokes one of the caller's own tokens; it stops working at once. */
export const revokeApiToken = adminAction({
  input: z.object({ tokenId: recordIdSchema }),
  fallbackError: "Could not revoke the token",
  handler: async ({ tokenId }, { userId }) => {
    const { count } = await prisma.apiToken.updateMany({
      where: { id: tokenId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    })
    if (count === 0) return fail("NOT_FOUND", "That token is already gone")
    logAuditEvent(AuditEventType.API_TOKEN_REVOKED, userId, { credentialId: tokenId })
    revalidatePath("/admin/settings")
    return ok(null)
  },
})
