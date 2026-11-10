/**
 * The field catalogue (TS 4.1): one `FieldMeta` for each field, with every
 * word that the editor shows about it. The editor, the plain words, the
 * recipe Sheet and the preview read it, so the UI and the server describe a
 * rule the same way. Client-safe.
 *
 * @module lib/cleanup/fields/catalog
 */

import type { DescribeWords, FieldGroup } from "@/lib/cleanup/engine/types"
import { addedField, lastEpisodeAddedField, requestAgeField } from "@/lib/cleanup/fields/dated"
import { sizeField } from "@/lib/cleanup/fields/library"
import { requestByField, requestersField, requestExistsField } from "@/lib/cleanup/fields/requests"
import { positionField, seasonsOnDiskField, statusField } from "@/lib/cleanup/fields/shows"
import type { FieldCatalog, FieldDef, Form } from "@/lib/cleanup/fields/types"
import { lastPlayedField, playsField } from "@/lib/cleanup/fields/watching"
import { NOUNS, SERVICE_NAMES } from "@/lib/cleanup/fields/words"
import type { Condition, ConditionOf } from "@/lib/validations/cleanup-rule"
import { FIELD_IDS, type FieldId, type Level, type Service } from "@/lib/validations/cleanup-vocabulary"

/** @internal Exported for the tests. */
export const FIELD_CATALOG: FieldCatalog = {
  "watch.lastPlayed": lastPlayedField,
  "watch.plays": playsField,
  "request.exists": requestExistsField,
  "request.age": requestAgeField,
  "request.by": requestByField,
  "request.requesters": requestersField,
  "library.added": addedField,
  "file.size": sizeField,
  "show.status": statusField,
  "show.lastEpisodeAdded": lastEpisodeAddedField,
  "show.seasonsOnDisk": seasonsOnDiskField,
  "season.position": positionField,
}

/** The catalogue entry of one field. */
export function fieldMeta<F extends FieldId>(id: F): FieldDef<F> {
  return FIELD_CATALOG[id]
}

/** The entry of any field, as a union: its parts that do not take a condition can be read and called. */
export type AnyFieldDef = FieldCatalog[FieldId]

/** The entry of a field known only at run time. Use `visit()` to call its condition methods. */
export const anyFieldMeta = (id: FieldId): AnyFieldDef => FIELD_CATALOG[id]

/** A function that works on any field with its own condition type. */
export type FieldVisitor<R> = <F extends FieldId>(meta: FieldDef<F>, c: ConditionOf<F>) => R

/** Calls `fn` with the catalogue entry of the condition's field, the two typed alike. */
export function visit<R>(c: Condition, fn: FieldVisitor<R>): R {
  switch (c.field) {
    case "watch.lastPlayed":
      return fn(FIELD_CATALOG[c.field], c)
    case "watch.plays":
      return fn(FIELD_CATALOG[c.field], c)
    case "request.exists":
      return fn(FIELD_CATALOG[c.field], c)
    case "request.age":
      return fn(FIELD_CATALOG[c.field], c)
    case "request.by":
      return fn(FIELD_CATALOG[c.field], c)
    case "request.requesters":
      return fn(FIELD_CATALOG[c.field], c)
    case "library.added":
      return fn(FIELD_CATALOG[c.field], c)
    case "file.size":
      return fn(FIELD_CATALOG[c.field], c)
    case "show.status":
      return fn(FIELD_CATALOG[c.field], c)
    case "show.lastEpisodeAdded":
      return fn(FIELD_CATALOG[c.field], c)
    case "show.seasonsOnDisk":
      return fn(FIELD_CATALOG[c.field], c)
    case "season.position":
      return fn(FIELD_CATALOG[c.field], c)
  }
}

/** The field picker groups, in order (UX 6). */
export const FIELD_GROUPS: readonly FieldGroup[] = ["watching", "requests", "library", "showsSeasons"]
export const FIELD_GROUP_LABELS: Record<FieldGroup, string> = {
  watching: "Watching",
  requests: "Requests",
  library: "Library",
  showsSeasons: "Shows and seasons",
}

/** The fields of one picker group, in picker order. */
export const fieldsOfGroup = (group: FieldGroup): AnyFieldDef[] => FIELD_IDS.map(anyFieldMeta).filter((meta) => meta.group === group)

/** The predicate of a complete condition after "that" (UX 5.8): plural for a condition, singular for a protection. */
export function describeCondition(c: Condition, level: Level, words: DescribeWords, form: Form = "plural"): string {
  return visit(c, (meta, condition) => meta.predicate(condition, level, words, form))
}

/** The condition with a preset chip's value on its main control. An unknown value changes nothing. */
export function withPreset(c: Condition, value: unknown): Condition {
  return visit<Condition>(c, (meta, condition) => meta.withPreset(condition, value))
}

/**
 * Why the field picker shows a field disabled (UX 6, UX 8.4), or null. A
 * field of other levels comes first, then the first needed service that is
 * not set up: "Set up Sonarr to use this".
 */
export function fieldDisabledReason(id: FieldId, level: Level, isSetUp: (service: Service) => boolean): string | null {
  const meta = anyFieldMeta(id)
  if (!meta.levels.includes(level)) return meta.levels.includes("show") ? "Only for whole shows and seasons" : "Only for seasons"
  const missing = meta.needs.find((service) => !isSetUp(service))
  return missing ? `Set up ${SERVICE_NAMES[missing]} to use this` : null
}

/** "{Field} does not apply to {level}. Remove it, or change the level back." (UX 6 rule 4, UX 8.4) */
export function notApplicableMessage(id: FieldId, level: Level): string {
  return `${anyFieldMeta(id).token} does not apply to ${NOUNS[level][1]}. Remove it, or change the level back.`
}
