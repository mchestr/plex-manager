/**
 * The Global protections section of the Settings tab (UX 4.10, 8.8, TS 5.3,
 * 5.6): each of G1 to G13 with its sentence, "Always on" for G1 and G3
 * (E30), "Protects N titles" on the newest snapshot ("seasons" for G11 and
 * G12), and the needed services that are not set up ("Needs {Service}").
 * Server-only, as `protectsCounts()` is.
 *
 * The count is the one of `previewCleanupProtectionImpact` with the stored
 * values (`protectsCounts()`): movies and shows of the libraries in scope.
 * It is null without library data, and for a protection that is off.
 *
 * @module lib/cleanup/screens/settings/protections
 */

import "server-only"

import { GLOBAL_PROTECTION_IDS } from "@/lib/cleanup/constants"
import type { EvalContext, GlobalProtectionId } from "@/lib/cleanup/engine/types"
import { protectsCounts } from "@/lib/cleanup/preview/protection-impact"
import { globalProtectionSentence } from "@/lib/cleanup/preview/protection-words"
import type { LoadedSnapshot } from "@/lib/cleanup/snapshot/cache"
import type { ProtectionImpactResult } from "@/lib/cleanup/types/actions"
import type { SettingsProtection } from "@/lib/cleanup/types/list-parts"
import type { CleanupOptions } from "@/lib/validations/cleanup-options"
import type { Service } from "@/lib/validations/cleanup-vocabulary"

/** The services each global protection reads (TS 5.3 "Needs"). G9 reads the arr of the level. */
const GLOBAL_NEEDS: Record<GlobalProtectionId, readonly Service[]> = {
  g1: [], g2: [], g3: [], g4: ["tautulli"], g5: ["tautulli"], g6: [], g7: ["overseerr"], g8: ["plex"], g9: ["radarr", "sonarr"], g10: [],
  g11: ["sonarr"], g12: ["tautulli"], g13: ["plex"],
}

const ALWAYS_ON = new Set<GlobalProtectionId>(["g1", "g3"])
const SEASONS_ONLY = new Set<GlobalProtectionId>(["g11", "g12"])

/** The thirteen rows of the section, in Settings order. */
export function settingsProtections(input: { snapshot: LoadedSnapshot | null; ctx: EvalContext | null; options: CleanupOptions;
  setUp: ReadonlySet<Service> }): SettingsProtection[] {
  const { snapshot, ctx, options } = input
  const counts: ProtectionImpactResult["protects"] =
    snapshot && ctx ? protectsCounts({ levels: snapshot.levels, libraries: snapshot.header.facts.libraries, draft: ctx }) : {}
  return GLOBAL_PROTECTION_IDS.map((id) => ({
    id,
    sentence: globalProtectionSentence(id, options.protections),
    alwaysOn: ALWAYS_ON.has(id),
    protects: counts[id] ?? null,
    unit: SEASONS_ONLY.has(id) ? "seasons" : "titles",
    needsMissing: GLOBAL_NEEDS[id].filter((service) => !input.setUp.has(service)),
    seasonsOnly: SEASONS_ONLY.has(id),
  }))
}
