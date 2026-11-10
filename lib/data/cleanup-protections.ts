/**
 * The Kept and excluded tab of `/admin/cleanup` (UX 4.8, 12.6 item 1, TS
 * 10.4): the four tiles and one page of the member Keeps and the admin
 * exclusions that protect now. Admin only, stored data only.
 *
 * The rows name members, so every load writes `auditMemberListed` with the
 * surface `cleanup-keeps` and the filters (at most one row per admin and
 * hour, `lib/security/audit-log.ts`).
 *
 * @module lib/data/cleanup-protections
 */

import "server-only"

import { assertAdmin } from "@/lib/admin"
import { activeProtectionWhere } from "@/lib/cleanup/protections"
import { parseProtectionsParams } from "@/lib/cleanup/screens/leaving/params"
import { readPeople } from "@/lib/cleanup/screens/leaving/people"
import { personIdOf, PROTECTIONS_ORDER, protectionRow, protectionsWhere } from "@/lib/cleanup/screens/protections/rows"
import { readProtectionTiles } from "@/lib/cleanup/screens/protections/tiles"
import { readCleanupSettingsRow } from "@/lib/cleanup/settings"
import type { CleanupProtectionsData } from "@/lib/cleanup/types/screens"
import { prisma } from "@/lib/prisma"
import { auditMemberListed } from "@/lib/security/audit-log"
import type { SearchParamsInput } from "@/lib/ui/table-params"

/**
 * The Kept and excluded tab. `params` are the page's search params: `q`,
 * `kind` (`keep` or `exclude`), `page` and `size` (TS 10.4).
 *
 * @throws the `PM_FORBIDDEN` or `PM_UNAUTHENTICATED` error from {@link assertAdmin}
 */
export async function getCleanupProtections(params: SearchParamsInput, now: Date = new Date()): Promise<CleanupProtectionsData> {
  const session = await assertAdmin()
  const input = parseProtectionsParams(params)
  await auditMemberListed("cleanup-keeps", session.user.id, { q: input.q, kind: input.kind })

  const where = protectionsWhere(input, activeProtectionWhere(now))
  const settings = await readCleanupSettingsRow()
  const [tiles, total, rows] = await Promise.all([
    readProtectionTiles(now, settings.options.members.keepDays),
    prisma.cleanupProtection.count({ where }),
    prisma.cleanupProtection.findMany({ where, orderBy: PROTECTIONS_ORDER, skip: (input.page - 1) * input.size, take: input.size }),
  ])
  const people = await readPeople(rows.map(personIdOf), session.user.id)
  return { tiles, rows: rows.map((row) => protectionRow(row, people)), total, page: input.page, size: input.size }
}
