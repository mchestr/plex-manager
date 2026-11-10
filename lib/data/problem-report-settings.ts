/**
 * The admin Problem reports tab's settings loaders (docs/problem-reports.md),
 * admins only: the breaker, the settings card with its newest audited save,
 * and the recycle bins that members' swaps need before they can turn On.
 *
 * @module lib/data/problem-report-settings
 */

import "server-only"

import { assertAdmin } from "@/lib/admin"
import type { ProblemAutomaticMode } from "@/lib/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import type { SwapLimits } from "@/lib/problem-reports/gate"
import { servicesWithoutRecycleBin } from "@/lib/problem-reports/recycle-bins"
import { getProblemReportSettings, getSwapSettings, PROBLEM_REPORT_SETTINGS_ID } from "@/lib/problem-reports/settings"
import { AuditEventType } from "@/lib/security/audit-log"
import type { LastSaved } from "@/lib/settings/audit-meta"

/** When the breaker tripped, while fixes that replace files are paused; null otherwise. */
export async function getProblemBreaker(): Promise<Date | null> {
  await assertAdmin()
  const row = await prisma.problemReportSettings.findUnique({ where: { id: PROBLEM_REPORT_SETTINGS_ID }, select: { breakerTrippedAt: true } })
  return row?.breakerTrippedAt ?? null
}

/** The settings card's values: the switch, members' swaps and their limits, and the newest audited save. */
export interface ProblemReportSettingsView extends SwapLimits {
  enabled: boolean
  automatic: ProblemAutomaticMode
  lastSaved: LastSaved | null
}

export async function getProblemReportSettingsView(): Promise<ProblemReportSettingsView> {
  await assertAdmin()
  const [settings, swaps, row] = await Promise.all([
    getProblemReportSettings(),
    getSwapSettings(),
    prisma.auditLog.findFirst({
      where: { type: AuditEventType.PROBLEM_REPORT_SETTINGS_CHANGED },
      orderBy: { createdAt: "desc" },
      select: { id: true, actorUserId: true, createdAt: true },
    }),
  ])
  const values = { enabled: settings.enabled, automatic: swaps.automatic, weeklySwaps: swaps.weeklySwaps, titleCooldownDays: swaps.titleCooldownDays, dailySwapCap: swaps.dailySwapCap }
  if (!row) return { ...values, lastSaved: null }
  const actor = await prisma.user.findUnique({ where: { id: row.actorUserId }, select: { name: true, email: true } })
  return { ...values, lastSaved: { at: row.createdAt, by: actor?.name || actor?.email || "an admin", eventId: row.id } }
}

/** Radarr and Sonarr set up without a recycle bin, which keeps members' swaps from turning On; read as the page streams. */
export async function getSwapRecycleBins(): Promise<("Radarr" | "Sonarr")[]> {
  await assertAdmin()
  return servicesWithoutRecycleBin()
}
