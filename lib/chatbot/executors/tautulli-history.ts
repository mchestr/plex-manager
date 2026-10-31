import "server-only"

import { z } from "zod"

import { toConnectionResult } from "@/lib/connections/http"
import { tautulliCommand } from "@/lib/connections/tautulli"
import { prisma } from "@/lib/prisma"
import { auditMemberRead } from "@/lib/security/audit-log"
import { firstIndex } from "./plex-tautulli-reply"
import { type HistoryQuery } from "./tautulli-lists"

/**
 * The watch history request, and the audit of the members it reads.
 *
 * @module
 */

type TautulliConfig = Parameters<typeof tautulliCommand>[0]

/**
 * The columns of `get_history` a search matches. Tautulli's own default for
 * the API also searches `ip_address` (`LIKE '%text%'`), so a search such as
 * "203.0.113." would find who played from an address, and its count would
 * spell out a member's address digit by digit (SEC-42). Sending `json_data`
 * replaces that default; `date` is listed only to order by.
 */
const HISTORY_COLUMNS = [
  { data: "date", orderable: true, searchable: false },
  ...["friendly_name", "full_title", "platform", "product", "player"].map((data) => ({ data, orderable: true, searchable: true })),
]

/** `get_history`'s DataTables request for one page, newest first, searching {@link HISTORY_COLUMNS} only. */
function historyJsonData(query: HistoryQuery): string {
  return JSON.stringify({
    draw: 1,
    columns: HISTORY_COLUMNS,
    order: [{ column: 0, dir: "desc" }],
    start: firstIndex(query),
    length: query.limit,
    search: { value: query.search ?? "" },
  })
}

/** One page of `get_history`, for one user when `userId` is given. */
export async function historyPage(config: TautulliConfig, query: HistoryQuery) {
  const params = { user_id: query.userId, json_data: historyJsonData(query) }
  return toConnectionResult("Tautulli", await tautulliCommand(config, "get_history", params, z.unknown()))
}

/**
 * Audit an admin's reads of members' Tautulli data (P11.16, GAP-33), once per
 * member. Tautulli's user id is the Plex account id, so each member is the app
 * user with that Plex id; a Plex user with no account here has nothing to
 * attach the row to, and the admin's own data is not audited.
 */
export async function auditTautulliMemberReads(tautulliUserIds: readonly unknown[], actorUserId: string | undefined) {
  const plexUserIds = [...new Set(tautulliUserIds.filter((id) => typeof id === "number" || typeof id === "string").map(String))]
  if (plexUserIds.length === 0 || !actorUserId) return
  const members = await prisma.user.findMany({ where: { plexUserId: { in: plexUserIds } }, select: { id: true } })
  await Promise.all(members.filter((member) => member.id !== actorUserId).map((member) => auditMemberRead("chatbot-tautulli", member.id, actorUserId)))
}
