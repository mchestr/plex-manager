/**
 * The plex.tv accounts with an accepted share of the active Plex server, read
 * once for a whole sweep (`lib/inactivity/sweep.ts`) and for the admin page's
 * preview (`lib/data/inactivity-preview.ts`), so both decide "has access" the
 * same way.
 *
 * | Case                                              | Result                    |
 * |---------------------------------------------------|---------------------------|
 * | No active Plex server                             | `no_plex_server`          |
 * | The server's machine identifier cannot be read    | `plex_unavailable`        |
 * | plex.tv refuses the server token (401)            | `plex_auth`               |
 * | plex.tv does not answer                           | `plex_unavailable`        |
 * | Otherwise                                         | the share ids, and the server to unshare from |
 *
 * A pending invite is not access: only `activeShareFor` (accepted shares)
 * counts. Without a share list, access is unknown, so the sweep removes no one.
 *
 * @module lib/inactivity/shares
 */

import "server-only"

import { getPlexUsers } from "@/lib/connections/plex"
import { withMachineIdentifier } from "@/lib/connections/plex-machine-id"
import { activeShareFor } from "@/lib/connections/plex-tv-users"
import type { PlexServer } from "@/lib/generated/prisma/client"
import type { InactivityBlock } from "@/lib/inactivity/blocks"

/** Why the share list could not be read: the block a run stops on. */
export type ShareBlock = Extract<InactivityBlock, "no_plex_server" | "plex_unavailable" | "plex_auth">

/** The server a removal unshares from. */
export interface ShareServer {
  url: string
  token: string
  machineIdentifier: string
  adminPlexUserId: string | null
}

export type PlexShares = { ok: true; ids: ReadonlySet<string>; server: ShareServer } | { ok: false; block: ShareBlock }

/** Reads plex.tv's member list once and keeps the accounts with an accepted share of `active`. */
export async function readPlexShares(active: PlexServer | null): Promise<PlexShares> {
  if (!active) return { ok: false, block: "no_plex_server" }
  const server = await withMachineIdentifier(active)
  const { machineIdentifier } = server
  if (!machineIdentifier) return { ok: false, block: "plex_unavailable" }
  const users = await getPlexUsers(server.token)
  if (!users.success || !users.data) return { ok: false, block: users.status === 401 ? "plex_auth" : "plex_unavailable" }
  return {
    ok: true,
    ids: new Set(users.data.filter((user) => activeShareFor(user, machineIdentifier)).map((user) => user.id)),
    server: { url: server.url, token: server.token, machineIdentifier, adminPlexUserId: server.adminPlexUserId },
  }
}

/** Whether `plexUserId` (trimmed) holds a share in `shares`. */
export function hasShare(shares: ReadonlySet<string>, plexUserId: string | null): boolean {
  const id = plexUserId?.trim()
  return Boolean(id) && shares.has(id!)
}
