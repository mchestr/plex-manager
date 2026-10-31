/**
 * Personal API tokens for the MCP endpoint (`/api/mcp`, docs/mcp.md).
 *
 * A token is `pmk_` and 43 base64url characters (32 random bytes). Only its
 * SHA-256 is stored, so a database read cannot replay one; the owner sees the
 * token once, when it is made.
 *
 * Each request re-reads the owner: a token works only while its owner is an
 * admin and not disabled, and only until it is revoked or expires. The session
 * it yields carries the owner's current admin flag and role, so demoting or
 * disabling someone stops their tokens at once. A `read` token reaches only
 * the tools that read; a `full` one, every tool its owner may use.
 *
 * @module lib/mcp/tokens
 */

import "server-only"

import { createHash, randomBytes } from "node:crypto"
import type { Session } from "next-auth"

import type { ApiTokenScope } from "@/lib/generated/prisma/client"
import { parseRole } from "@/lib/permissions"
import { prisma } from "@/lib/prisma"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("MCP_TOKENS")

/** @internal Exported for the token tests. */
export const TOKEN_PREFIX = "pmk_"
/** The characters of a token kept as its visible prefix. */
const PREFIX_LENGTH = TOKEN_PREFIX.length + 6
/** `lastUsedAt` is written at most this often per token. */
const LAST_USED_RESOLUTION_MS = 5 * 60 * 1000
/** A session built for one MCP request; NextAuth's shape wants an expiry. */
const SESSION_TTL_MS = 5 * 60 * 1000

const TOKEN_PATTERN = /^pmk_[A-Za-z0-9_-]{43}$/

/**
 * The stored form of a token: SHA-256, hex. A fast digest is right here: the
 * input is 256 random bits, which no slow password hash would protect better,
 * and the endpoint hashes it on every request to find the row.
 *
 * @internal Exported for the token tests.
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

/** A fresh token and what is stored for it. */
export function generateToken(): { token: string; tokenHash: string; prefix: string } {
  const token = `${TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`
  return { token, tokenHash: hashToken(token), prefix: token.slice(0, PREFIX_LENGTH) }
}

/** The bearer token of an `Authorization` header, or null. */
export function bearerToken(header: string | null): string | null {
  const match = header?.match(/^Bearer\s+(\S+)$/i)
  return match && TOKEN_PATTERN.test(match[1]) ? match[1] : null
}

export interface TokenPrincipal {
  tokenId: string
  /** `read` limits the token to the tools that only read (`lib/mcp/catalog.ts`). */
  scope: ApiTokenScope
  session: Session
}

/**
 * The owner's session for a token, or null when the token is unknown,
 * revoked, expired, or its owner is no longer an enabled admin.
 */
export async function authenticateToken(token: string, now = new Date()): Promise<TokenPrincipal | null> {
  const row = await prisma.apiToken.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      id: true,
      scope: true,
      revokedAt: true,
      expiresAt: true,
      lastUsedAt: true,
      user: { select: { id: true, name: true, email: true, image: true, isAdmin: true, role: true, disabledAt: true } },
    },
  })
  if (!row || row.revokedAt || (row.expiresAt && row.expiresAt <= now)) return null
  const { user } = row
  if (!user.isAdmin || user.disabledAt) return null

  if (!row.lastUsedAt || now.getTime() - row.lastUsedAt.getTime() > LAST_USED_RESOLUTION_MS) {
    // Awaited, so a host that freezes the process after the response keeps it; a failure only logs
    try {
      await prisma.apiToken.update({ where: { id: row.id }, data: { lastUsedAt: now } })
    } catch (error) {
      logger.warn("Could not record the token's last use", { credentialId: row.id, error })
    }
  }

  return {
    tokenId: row.id,
    scope: row.scope,
    session: {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image,
        isAdmin: user.isAdmin,
        role: parseRole(user.role),
      },
      expires: new Date(now.getTime() + SESSION_TTL_MS).toISOString(),
    },
  }
}
