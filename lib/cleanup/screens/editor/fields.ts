/**
 * The editor's picker data (UX 12.2, TS 4.1, 5.3 and 5.5): every field with
 * its label, operators and default at the rule's level and why it is
 * disabled, the libraries with why each is not offered, and the global
 * protections of the level. Pure and client-safe.
 *
 * @module lib/cleanup/screens/editor/fields
 */

import { GLOBAL_PROTECTION_IDS } from "@/lib/cleanup/constants"
import { GLOBAL_LEVELS, isGlobalEnabled } from "@/lib/cleanup/engine/protections"
import { anyFieldMeta, fieldDisabledReason } from "@/lib/cleanup/fields/catalog"
import { SERVICE_NAMES } from "@/lib/cleanup/fields/words"
import { globalProtectionSentence } from "@/lib/cleanup/preview/protection-words"
import type { SnapshotLibrary } from "@/lib/cleanup/schema/snapshot"
import type { EditorField, EditorGlobalProtection, EditorLibrary } from "@/lib/cleanup/types/rule-parts"
import type { CleanupOptions } from "@/lib/validations/cleanup-options"
import { FIELD_IDS, LEVEL_ARR, type Level, type Service } from "@/lib/validations/cleanup-vocabulary"

/** The reason of a library with no arr root folder: "Radarr does not manage this library". */
const notManagedReason = (type: "movie" | "show") => `${SERVICE_NAMES[LEVEL_ARR[type]]} does not manage this library`
/** The reason of a library whose titles have no external ids (agent `com.plexapp.agents.none`). */
const NO_IDS_REASON = "Its titles have no matchable ids"

/** Every field in Why order, with the words and default of `level` and the reason it is disabled. */
export function editorFields(level: Level, setUp: ReadonlySet<Service>): EditorField[] {
  return FIELD_IDS.map((id) => {
    const meta = anyFieldMeta(id)
    const { op, value } = meta.defaultCondition(level)
    return {
      id,
      label: meta.label(level),
      levels: [...meta.levels],
      operators: [...meta.operators],
      defaultValue: { op, value },
      help: meta.help,
      disabledReason: fieldDisabledReason(id, level, (service) => setUp.has(service)),
    }
  })
}

/** Every library of the library data, with why it is not offered (TS 5.5), in Plex order. */
export function editorLibraries(libraries: readonly SnapshotLibrary[]): EditorLibrary[] {
  return libraries.map((l) => ({
    sectionId: l.sectionId,
    title: l.title,
    level: l.type,
    arr: l.arr,
    disabledReason: l.arr === null ? notManagedReason(l.type) : l.noIds ? NO_IDS_REASON : null,
  }))
}

/** The thirteen global protections, in Settings order, with their sentence, state and whether they apply to `level`. */
export function editorGlobalProtections(level: Level, options: CleanupOptions): EditorGlobalProtection[] {
  return GLOBAL_PROTECTION_IDS.map((id) => ({
    id,
    sentence: globalProtectionSentence(id, options.protections),
    enabled: isGlobalEnabled(id, options),
    appliesToLevel: GLOBAL_LEVELS[id].includes(level),
  }))
}
