/**
 * Whether Look for a better copy can find anything: a search with the file in
 * place grabs a release only when the quality profile counts it as an
 * upgrade, so the app asks the same question first (docs/problem-reports.md,
 * "Look for a better copy").
 *
 * The profile must allow upgrades, and the file must be below its quality
 * cutoff (`qualityCutoffNotMet`) or below its custom format cutoff
 * (`customFormatScore < cutoffFormatScore`). The quality cutoff alone misses
 * a file at the right resolution from a worse release, which only its custom
 * format score shows. Where the service doesn't say how the file compares,
 * the answer is no.
 *
 * @module lib/problem-reports/upgrade
 */

import "server-only"

import { getArrQualityProfile, type ArrFile, type ArrQualityProfile } from "@/lib/connections/arr-upgrade"
import type { ResolvedFile } from "@/lib/problem-reports/resolve"

/** Whether a search with `file` in place can grab a better copy under `profile`. @internal */
export function wantsUpgrade(
  profile: Pick<ArrQualityProfile, "upgradeAllowed" | "cutoffFormatScore">,
  file: Pick<ArrFile, "qualityCutoffNotMet" | "customFormatScore">
): boolean {
  if (!profile.upgradeAllowed) return false
  if (file.qualityCutoffNotMet === true) return true
  return file.customFormatScore !== null && profile.cutoffFormatScore !== null && file.customFormatScore < profile.cutoffFormatScore
}

/** The rule for a resolved file, with its profile read fresh; `null` when the profile can't be read. */
export async function readUpgrade(resolved: ResolvedFile): Promise<boolean | null> {
  const profile = await getArrQualityProfile(resolved.service === "radarr" ? "Radarr" : "Sonarr", resolved.config, resolved.qualityProfileId)
  return profile.success ? wantsUpgrade(profile.data, resolved.file) : null
}
