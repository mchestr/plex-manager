/**
 * The season console's preflight (P7.8): one status row per thing a season
 * run needs, in `STATUS.connection` words (`lib/ui/status.ts`).
 *
 * | Row | Passes | Warns or fails |
 * |---|---|---|
 * | Redis | `checkRewindInfra()` answers | "Rewind needs Redis (REDIS_URL)" (FR-50) |
 * | Tautulli | 2.17 or later | below 2.17 (CVE-2026-31799), unreachable, not set up |
 * | Overseerr, Sonarr | set up | optional: not set up is not a warning |
 * | AI copy | the frozen model (P8.1), priced, not retiring before 2027-01-02 | unpriced, retiring, template-only mode, or a provider other than the lock's (red) |
 * | Entitlement | Stripe off, or every member entitled | members skipped for entitlement (P4.5) |
 *
 * @module lib/wrapped/admin/preflight
 */

import "server-only"

import { entitledUserWhere } from "@/lib/access"
import { getTautulliInfo } from "@/lib/connections/tautulli"
import { lookupModel } from "@/lib/llm/models"
import { isLLMProviderId } from "@/lib/llm/provider-presets"
import { frozenModelFor, lockedModelLabel, REWIND_LOCK } from "@/lib/wrapped/freeze/lock"
import { prisma } from "@/lib/prisma"
import { checkRewindInfra } from "@/lib/queue/rewind-infra"
import { rewindInfraMessage } from "@/lib/rewind/infra-copy"
import type { STATUS } from "@/lib/ui/status"
import { getActiveService } from "@/lib/data/active-service"

type PreflightStatus = keyof typeof STATUS.connection

export interface PreflightRow {
  /** Test id `admin-rewind-preflight-<id>`. */
  id: "redis" | "tautulli" | "overseerr" | "sonarr" | "llm" | "entitlement"
  label: string
  status: PreflightStatus
  detail: string
}

const MIN_TAUTULLI: readonly number[] = [2, 17, 0]
/** The model must still be served on the last day of the season's December runs. */
const MODEL_NEEDED_UNTIL = "2027-01-02"

/** Whether `version` ("2.16.9") is at least `min`. */
function atLeast(version: string, min: readonly number[]): boolean {
  const parts = version.split(".").map((part) => Number.parseInt(part, 10) || 0)
  for (let i = 0; i < min.length; i++) {
    const part = parts[i] ?? 0
    if (part !== min[i]) return part > min[i]
  }
  return true
}

async function redisRow(): Promise<PreflightRow> {
  const infra = await checkRewindInfra()
  const label = "Redis"
  if (infra.ok) return { id: "redis", label, status: "ok", detail: "Queues are reachable" }
  const status = infra.code === "REDIS_NOT_CONFIGURED" ? "notConfigured" : "unreachable"
  return { id: "redis", label, status, detail: rewindInfraMessage(infra.code, "admin") }
}

async function tautulliRow(): Promise<PreflightRow> {
  const label = "Tautulli"
  const config = await getActiveService("tautulli")
  if (!config) return { id: "tautulli", label, status: "notConfigured", detail: "Rewind reads its plays from Tautulli" }
  const info = await getTautulliInfo(config)
  if (!info.ok) return { id: "tautulli", label, status: "unreachable", detail: "Tautulli didn't respond" }
  const { version } = info.data
  if (!atLeast(version, MIN_TAUTULLI)) {
    return {
      id: "tautulli",
      label,
      status: "incomplete",
      detail: `Update Tautulli: versions before 2.17 are affected by CVE-2026-31799 (this is ${version})`,
    }
  }
  return { id: "tautulli", label, status: "ok", detail: `Version ${version}` }
}

async function optionalRows(): Promise<PreflightRow[]> {
  const [overseerr, sonarr] = await Promise.all([
    prisma.overseerr.count({ where: { isActive: true } }),
    prisma.sonarr.count({ where: { isActive: true } }),
  ])
  return [
    overseerr > 0
      ? { id: "overseerr", label: "Overseerr", status: "ok", detail: "Set up" }
      : { id: "overseerr", label: "Overseerr", status: "notConfigured", detail: "Optional: the Requests page uses it" },
    sonarr > 0
      ? { id: "sonarr", label: "Sonarr", status: "ok", detail: "Set up" }
      : { id: "sonarr", label: "Sonarr", status: "notConfigured", detail: "Optional: Next year's show picks use it" },
  ]
}

async function llmRow(config: { llmDisabled: boolean; rewindLlmMode: string } | null): Promise<PreflightRow> {
  const label = "AI copy"
  if (config?.llmDisabled || config?.rewindLlmMode === "off") {
    return { id: "llm", label, status: "degraded", detail: "Template-only mode: Rewind writes template text" }
  }
  const provider = await prisma.lLMProvider.findFirst({
    where: { isActive: true, purpose: "wrapped" },
    select: { provider: true, model: true },
  })
  const frozen = frozenModelFor(provider, REWIND_LOCK.model)
  if (frozen?.status === "mismatch") {
    return {
      id: "llm",
      label,
      status: "unreachable",
      detail: `The Rewind provider is ${frozen.provider}, but the frozen model is ${lockedModelLabel(frozen.locked)}: Rewind writes template text`,
    }
  }
  if (!frozen || !isLLMProviderId(frozen.provider)) {
    return { id: "llm", label, status: "degraded", detail: "No AI provider: Rewind writes template text" }
  }
  const info = lookupModel(frozen.provider, frozen.model)
  if (!info.pricing) {
    return { id: "llm", label, status: "incomplete", detail: `${info.displayName} has no known price, so the budget cap can't count it` }
  }
  if (info.retiresOn && info.retiresOn < MODEL_NEEDED_UNTIL) {
    return { id: "llm", label, status: "incomplete", detail: `${info.displayName} retires on ${info.retiresOn}, before the season ends` }
  }
  return { id: "llm", label, status: "ok", detail: `${info.displayName}, priced${frozen.status === "frozen" ? `, frozen in ${REWIND_LOCK.version}` : ""}` }
}

async function entitlementRow(stripeEnabled: boolean): Promise<PreflightRow | null> {
  if (!stripeEnabled) return null
  const skipped = await prisma.user.count({
    where: { disabledAt: null, plexUserId: { not: null }, NOT: entitledUserWhere(true) },
  })
  const label = "Entitlement"
  if (skipped === 0) return { id: "entitlement", label, status: "ok", detail: "Every member has an active membership" }
  const members = skipped === 1 ? "1 member is" : `${skipped} members are`
  return { id: "entitlement", label, status: "incomplete", detail: `${members} skipped: no active membership` }
}

/** The preflight rows, in the table's order; the entitlement row only with Stripe on. */
export async function getRewindPreflight(): Promise<PreflightRow[]> {
  const config = await prisma.config.findUnique({
    where: { id: "config" },
    select: { llmDisabled: true, rewindLlmMode: true, stripeEnabled: true },
  })
  const [redis, tautulli, optional, llm, entitlement] = await Promise.all([
    redisRow(),
    tautulliRow(),
    optionalRows(),
    llmRow(config),
    entitlementRow(config?.stripeEnabled ?? false),
  ])
  return [redis, tautulli, ...optional, llm, ...(entitlement ? [entitlement] : [])]
}
