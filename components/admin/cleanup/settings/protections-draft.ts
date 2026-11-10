/**
 * The draft of the Global protections Edit form (UX 4.10, 5.4.1, TS 3.3):
 * the options with each "days" field `null` while it is empty, the row of
 * each protection in Settings order, and the check that turns a draft into
 * the options that `updateCleanupSettings` and
 * `previewCleanupProtectionImpact` take. Pure and client-safe.
 *
 * @module components/admin/cleanup/settings/protections-draft
 */

import type { GlobalProtectionId } from "@/lib/cleanup/engine/types"
import type { ProtectionsOptions } from "@/lib/validations/cleanup-options"

/** The protections with a number of days (TS 3.3): 1 to 3650. */
const DAYS_IDS = ["g4", "g5", "g6", "g7", "g12"] as const
export type DaysId = (typeof DAYS_IDS)[number]
const DAYS_MIN = 1
const DAYS_MAX = 3650
/** The most tags of G9 and collections of G13 (TS 3.3). @internal */
export const LIST_MAX = 20

/** The options with each number of days `null` while its field is empty. */
export type ProtectionsDraft = {
  [K in keyof ProtectionsOptions]: K extends DaysId ? Omit<ProtectionsOptions[K], "days"> & { days: number | null } : ProtectionsOptions[K]
}

/** The ids that have options: every global protection except G1 and G3, which are always on (E30). */
export type OptionId = keyof ProtectionsOptions

/** The read view and Edit order of `shots/10-settings.png`: the two that are always on first. */
export const SETTINGS_ORDER: readonly GlobalProtectionId[] = ["g1", "g3", "g2", "g4", "g5", "g6", "g7", "g8", "g9", "g10", "g11", "g12", "g13"]

/** Always on, with a locked checkbox (UX 4.10 rule 1, TS E30). */
export const isLocked = (id: GlobalProtectionId): id is "g1" | "g3" => id === "g1" || id === "g3"

/** An Overseerr requester tag `<id>-<username>`: it holds a user name, so the picker hides it (UX 4.10 rule 2). */
export const REQUESTER_TAG = /^\d+-/

/** The draft of saved options: a copy, so an edit never changes the saved values. */
export function draftOf(options: ProtectionsOptions): ProtectionsDraft {
  return JSON.parse(JSON.stringify(options)) as ProtectionsDraft
}

/** The error of a number of days, or undefined: "Enter a whole number of days from 1 to 3650." */
export function daysError(days: number | null): string | undefined {
  if (days !== null && Number.isInteger(days) && days >= DAYS_MIN && days <= DAYS_MAX) return undefined
  return `Enter a whole number of days from ${DAYS_MIN} to ${DAYS_MAX}.`
}

/** The error of the tags or collections of a list, or undefined. */
function listError(id: "g9" | "g13", list: readonly string[]): string | undefined {
  if (list.length <= LIST_MAX) return undefined
  return id === "g9" ? `Choose at most ${LIST_MAX} tags.` : `Choose at most ${LIST_MAX} collections.`
}

/** The field errors of a draft, by `{gid}-days`, `g9-tags` and `g13-collections`. */
export function draftErrors(draft: ProtectionsDraft): Partial<Record<string, string>> {
  const errors: Partial<Record<string, string>> = {}
  for (const id of DAYS_IDS) {
    const error = daysError(draft[id].days)
    if (error) errors[`${id}-days`] = error
  }
  const tags = listError("g9", draft.g9.tags)
  if (tags) errors["g9-tags"] = tags
  const collections = listError("g13", draft.g13.collections)
  if (collections) errors["g13-collections"] = collections
  return errors
}

/** The options of a draft with no error, else null. */
export function toProtections(draft: ProtectionsDraft): ProtectionsOptions | null {
  if (Object.keys(draftErrors(draft)).length > 0) return null
  const out: Record<string, unknown> = { ...draft }
  for (const id of DAYS_IDS) out[id] = { ...draft[id], days: draft[id].days ?? DAYS_MIN }
  return out as ProtectionsOptions
}

/** Whether a protection is on in the draft. G1 and G3 always are. */
function isOn(draft: ProtectionsDraft, id: GlobalProtectionId): boolean {
  return isLocked(id) || draft[id].enabled
}

/** How many protections are on: the badge "{N} on" (UX 8.8). */
export const onCount = (draft: ProtectionsDraft): number => SETTINGS_ORDER.filter((id) => isOn(draft, id)).length

/** The draft with one protection changed. */
export function withProtection<K extends OptionId>(draft: ProtectionsDraft, id: K, patch: Partial<ProtectionsDraft[K]>): ProtectionsDraft {
  return { ...draft, [id]: { ...draft[id], ...patch } }
}

/** The collections of G13 with `names` added, each once, and the protection on: "Add both" (UX 4.10 rule 4). */
export function addCollections(draft: ProtectionsDraft, names: readonly string[]): ProtectionsDraft {
  const collections = [...draft.g13.collections]
  for (const name of names) if (!collections.includes(name)) collections.push(name)
  return withProtection(draft, "g13", { enabled: true, collections })
}
