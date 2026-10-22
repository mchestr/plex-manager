/**
 * The invite page's one lookup (UI-36): an invite code to the InvitePass
 * data, behind the `invite:validate` limit.
 *
 * ## Process
 *
 * 1. Spend one `invite:validate` point for the caller's address. React
 *    `cache()` makes `generateMetadata` and the page share one call per
 *    request, so a visit costs one point and one lookup.
 * 2. Parse the code with `inviteCodeSchema`; a code that is not one reads as
 *    `unknown`.
 * 3. Read the row. A missing row, or a Jellyfin invite while no Jellyfin
 *    server is active, reads as `unknown`.
 * 4. Otherwise the state is `expired` (past `expiresAt`), `used-up`
 *    (`useCount >= maxUses`) or `valid`, with the inviter's name, the library
 *    names and the stub fields.
 *
 * Redemption still validates on its own, atomically (`validateAndUseInvite`);
 * this is for display only.
 *
 * @module lib/invites/pass
 */

import "server-only"

import { cache } from "react"

import { monogramFor, serverName as brandServerName } from "@/lib/brand"
import { inviteLibraryNames } from "@/lib/invites/library-names"
import { prisma } from "@/lib/prisma"
import { actionClientIp, consume } from "@/lib/security/rate-limit"
import { getFormat } from "@/lib/settings/app-settings"
import { inviteCodeSchema } from "@/lib/validations/invite"
import type { InvitePassData, InviteState } from "@/types/invite"

export type InvitePassLookup = { ok: true; pass: InvitePassData } | { ok: false; code: "RATE_LIMITED" }

const inviteSelect = {
  code: true,
  serverType: true,
  maxUses: true,
  useCount: true,
  expiresAt: true,
  createdBy: true,
  librarySectionIds: true,
  jellyfinLibraryIds: true,
} as const

function stateOf(invite: { expiresAt: Date | null; useCount: number; maxUses: number }, now: Date): InviteState {
  if (invite.expiresAt && invite.expiresAt < now) return "expired"
  if (invite.useCount >= invite.maxUses) return "used-up"
  return "valid"
}

function unknownPass(code: string, serverName: string): InvitePassData {
  return {
    state: "unknown",
    code,
    serverType: "PLEX",
    serverName,
    monogram: monogramFor(serverName),
    inviter: null,
    libraries: [],
    usesLeft: null,
    expiresOn: null,
  }
}

/** The creator's name; null for a deleted creator, a blank name or an email-shaped one. */
async function inviterName(userId: string | null): Promise<string | null> {
  if (!userId) return null
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } })
  const name = user?.name?.trim()
  return name && !name.includes("@") ? name : null
}

/** The active Jellyfin server's name, or null when none is active. */
async function activeJellyfinName(): Promise<string | null> {
  const server = await prisma.jellyfinServer.findFirst({
    where: { isActive: true },
    orderBy: { updatedAt: "desc" },
    select: { name: true },
  })
  return server?.name ?? null
}

/**
 * The InvitePass for `/invite/[code]`, or `RATE_LIMITED`.
 *
 * @param code - The code from the link, unvalidated
 */
export const getInvitePass = cache(async (code: string): Promise<InvitePassLookup> => {
  const limit = await consume("invite:validate", await actionClientIp())
  if (!limit.ok) return { ok: false, code: "RATE_LIMITED" }

  const brand = await brandServerName()
  const parsed = inviteCodeSchema.safeParse(code)
  if (!parsed.success) return { ok: true, pass: unknownPass("", brand) }

  const invite = await prisma.invite.findUnique({ where: { code: parsed.data }, select: inviteSelect })
  if (!invite) return { ok: true, pass: unknownPass(parsed.data, brand) }

  let serverName = brand
  if (invite.serverType === "JELLYFIN") {
    const jellyfinName = await activeJellyfinName()
    if (!jellyfinName) return { ok: true, pass: unknownPass(invite.code, brand) }
    serverName = jellyfinName
  }

  const [inviter, libraries, format] = await Promise.all([
    inviterName(invite.createdBy),
    inviteLibraryNames(invite),
    getFormat(),
  ])

  return {
    ok: true,
    pass: {
      state: stateOf(invite, new Date()),
      code: invite.code,
      serverType: invite.serverType,
      serverName,
      monogram: monogramFor(serverName),
      inviter,
      libraries,
      usesLeft: { left: Math.max(0, invite.maxUses - invite.useCount), total: invite.maxUses },
      expiresOn: invite.expiresAt ? format.date(invite.expiresAt, "long") : null,
    },
  }
})
