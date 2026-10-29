"use server"

import { randomInt } from "crypto"
import { revalidatePath } from "next/cache"
import { z } from "zod"

import { adminAction } from "@/lib/actions/define-action"
import { fail, ok } from "@/lib/actions/result"
import { invite as inviteRoute } from "@/lib/admin/routes"
import { ServerType } from "@/lib/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"
import { EXPIRES_IN_OPTIONS, type ExpiresIn } from "@/lib/validations/invite"

const INVITE_CODE_LENGTH = 8
const INVITE_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789" // No 0, O, I, l or 1
const HOUR_MS = 60 * 60 * 1000
const EXPIRES_IN_HOURS: Record<Exclude<ExpiresIn, "never">, number> = { "1d": 24, "48h": 48, "7d": 7 * 24, "30d": 30 * 24 }

/** What an admin may set on a new invite (SEC-56). Codes are stored upper case. */
const createInviteSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z2-9]{6,32}$/, "Custom codes are 6 to 32 letters and digits 2-9")
    .optional(),
  serverType: z.enum(["PLEX", "JELLYFIN"]).optional(),
  maxUses: z.number().int().min(1).max(1000).optional(),
  expiresIn: z.enum(EXPIRES_IN_OPTIONS).optional(),
  // Plex-specific: undefined shares every library
  librarySectionIds: z.array(z.number().int().nonnegative()).max(100).optional(),
  allowDownloads: z.boolean().optional(),
  // Jellyfin-specific: undefined grants every library
  jellyfinLibraryIds: z.array(z.string().min(1).max(64)).max(100).optional(),
})

/**
 * A random code from unambiguous characters. `crypto.randomInt`, because a
 * code grants server access and must not be predictable from earlier ones.
 */
function generateInviteCode(): string {
  let result = ""
  for (let i = 0; i < INVITE_CODE_LENGTH; i++) {
    result += INVITE_CODE_CHARS.charAt(randomInt(INVITE_CODE_CHARS.length))
  }
  return result
}

/** The expiry for an option; 48 hours when none is given, never for `never`. */
function expiresAtFor(expiresIn: ExpiresIn = "48h"): Date | null {
  if (expiresIn === "never") return null
  return new Date(Date.now() + EXPIRES_IN_HOURS[expiresIn] * HOUR_MS)
}

/** Stores a library id list as JSON, or null for "every library". */
function libraryIds(ids: readonly (string | number)[] | undefined): string | null {
  return ids && ids.length > 0 ? JSON.stringify(ids) : null
}

/** Each admin may create or delete 30 invites in ten minutes. */
const INVITES_LIMIT = { name: "admin:invites" } as const

/**
 * Create an invite (P10.1, BP-30). The server type defaults to Plex; a Plex
 * invite keeps only Plex library ids and Allow downloads, a Jellyfin invite
 * only Jellyfin library ids. Audited and rate-limited (P11.5).
 */
export const createInvite = adminAction({
  input: createInviteSchema,
  rateLimit: INVITES_LIMIT,
  fallbackError: "Could not create the invite",
  handler: async (options, { userId }) => {
    const code = options.code || generateInviteCode()
    const existing = await prisma.invite.findUnique({ where: { code }, select: { id: true } })
    if (existing) {
      return fail("CONFLICT", "That code is already in use", { fieldErrors: { code: ["That code is already in use"] } })
    }

    const jellyfin = options.serverType === "JELLYFIN"
    const serverType = jellyfin ? ServerType.JELLYFIN : ServerType.PLEX
    const maxUses = options.maxUses ?? 1
    const expiresAt = expiresAtFor(options.expiresIn)
    const invite = await prisma.invite.create({
      data: {
        code,
        serverType,
        createdBy: userId,
        maxUses,
        expiresAt,
        librarySectionIds: jellyfin ? null : libraryIds(options.librarySectionIds),
        allowDownloads: jellyfin ? false : (options.allowDownloads ?? false),
        jellyfinLibraryIds: jellyfin ? libraryIds(options.jellyfinLibraryIds) : null,
      },
      select: { id: true, code: true },
    })

    logAuditEvent(AuditEventType.INVITE_CREATED, userId, {
      inviteId: invite.id,
      serverType,
      maxUses,
      expiresAt: expiresAt?.toISOString() ?? null,
      customCode: Boolean(options.code),
    })
    revalidatePath("/admin/invites")
    revalidatePath(inviteRoute(invite.id))
    return ok(invite)
  },
})

/**
 * Delete an admin invite; its usage rows go with it. An affiliate invite id
 * reads as not found. Audited and rate-limited (P11.5).
 */
export const deleteInvite = adminAction({
  input: z.object({ id: z.string().min(1).max(64) }),
  rateLimit: INVITES_LIMIT,
  fallbackError: "Could not delete the invite",
  handler: async ({ id }, { userId }) => {
    const deleted = await prisma.invite.delete({ where: { id, kind: "ADMIN" }, select: { id: true, serverType: true, useCount: true } })
    logAuditEvent(AuditEventType.INVITE_DELETED, userId, {
      inviteId: id,
      serverType: deleted.serverType,
      useCount: deleted.useCount,
    })
    revalidatePath("/admin/invites")
    revalidatePath(inviteRoute(id))
    return ok(null)
  },
})
