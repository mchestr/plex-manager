/**
 * The options sections of `updateCleanupSettings` (TS 10.3): how one section
 * merges into the stored options, and what the audit row of a save holds.
 * Pure.
 *
 * The audit row holds the changed field names and closed values only
 * (TS 11.1, 11.2): booleans and numbers. A list of free text, the G9 tags
 * and the G13 collection names, is named in `changedFields` but its values
 * stay out, because a tag or a collection name can hold a member name.
 *
 * @module lib/cleanup/actions/settings/options
 */

import type { z } from "zod"

import type { CleanupOptions } from "@/lib/validations/cleanup-options"
import type { updateCleanupSettingsInput } from "@/lib/validations/cleanup-actions"

/** One save of `updateCleanupSettings`. */
type SettingsSave = z.infer<typeof updateCleanupSettingsInput>
/** A save of a section that lives in the options document: every section but the feature switch. */
export type OptionsSave = Exclude<SettingsSave, { section: "cleanup-feature" }>
export type OptionsSection = OptionsSave["section"]

/** A closed audit value. */
type ClosedValue = boolean | number

/** The audit details of a save (TS 11.1 `CLEANUP_SETTINGS_CHANGED`). */
export interface SectionChanges {
  changedFields: string[]
  before: Record<string, ClosedValue>
  after: Record<string, ClosedValue>
}

/** The stored options with the section's values in place. The other sections keep their stored values. */
export function mergeSection(options: CleanupOptions, save: OptionsSave): CleanupOptions {
  switch (save.section) {
    case "cleanup-protections":
      return { ...options, protections: save.values.protections }
    case "cleanup-budget": {
      const { entryCheck, automaticMinGraceDays, ...budget } = save.values
      return { ...options, budget, entryCheck, automaticMinGraceDays }
    }
    case "cleanup-defaults":
      return { ...options, defaults: save.values }
    case "cleanup-plex":
      return { ...options, plex: save.values }
    case "cleanup-members":
      return { ...options, members: save.values }
  }
}

/** Nested values as dotted field names: `{ g4: { days: 30 } }` gives `{ "g4.days": 30 }`. Lists stay whole. */
function flatten(value: object, prefix = ""): Record<string, unknown> {
  const fields: Record<string, unknown> = {}
  for (const [key, inner] of Object.entries(value)) {
    const name = prefix ? `${prefix}.${key}` : key
    if (inner !== null && typeof inner === "object" && !Array.isArray(inner)) Object.assign(fields, flatten(inner, name))
    else fields[name] = inner
  }
  return fields
}

/** The fields of one section, by the names that the audit row uses. @internal */
export function sectionFields(section: OptionsSection, options: CleanupOptions): Record<string, unknown> {
  switch (section) {
    case "cleanup-protections":
      return flatten(options.protections)
    case "cleanup-budget":
      return flatten({ ...options.budget, entryCheck: options.entryCheck, automaticMinGraceDays: options.automaticMinGraceDays })
    case "cleanup-defaults":
      return flatten(options.defaults)
    case "cleanup-plex":
      return flatten(options.plex)
    case "cleanup-members":
      return flatten(options.members)
  }
}

const isClosed = (value: unknown): value is ClosedValue => typeof value === "boolean" || typeof value === "number"
const same = (a: unknown, b: unknown) => (Array.isArray(a) && Array.isArray(b) ? a.length === b.length && a.every((v, i) => v === b[i]) : a === b)

/** The fields of `section` that differ between `before` and `after`, with their closed values. */
export function sectionChanges(section: OptionsSection, before: CleanupOptions, after: CleanupOptions): SectionChanges {
  const was = sectionFields(section, before)
  const now = sectionFields(section, after)
  const changes: SectionChanges = { changedFields: [], before: {}, after: {} }
  for (const field of Object.keys(now)) {
    if (same(was[field], now[field])) continue
    changes.changedFields.push(field)
    if (isClosed(was[field])) changes.before[field] = was[field]
    if (isClosed(now[field])) changes.after[field] = now[field]
  }
  return changes
}
