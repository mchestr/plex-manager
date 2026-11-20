/**
 * The options sections of `updateCleanupSettings` (TS 10.3, 11.1): how
 * each section merges into the stored options, the field names of the
 * audit row, and the closed values it may hold. Also the toast words.
 */

import { mergeSection, type OptionsSave, sectionChanges, sectionFields } from "@/lib/cleanup/actions/settings/options"
import { SETTINGS_TOASTS, settingsSavedToast } from "@/lib/cleanup/actions/settings/words"
import { parseCleanupOptions } from "@/lib/validations/cleanup-options"

const BASE = parseCleanupOptions({ members: { keepDays: 120 }, plex: { recommended: true } })

const SAVES: OptionsSave[] = [
  { section: "cleanup-protections", values: { protections: { ...BASE.protections, g2: { enabled: false } } } },
  { section: "cleanup-budget", values: { items: 40, bytes: BASE.budget.bytes, entryCheck: { count: 10, percent: 5 }, automaticMinGraceDays: 14 } },
  { section: "cleanup-defaults", values: { graceDays: 60, importListExclusion: false } },
  { section: "cleanup-plex", values: { ...BASE.plex, ownHome: false } },
  { section: "cleanup-members", values: { ...BASE.members, keepLimit: 5 } },
]

describe("mergeSection", () => {
  it.each(SAVES)("puts the $section values in place and keeps every other section", (save) => {
    const merged = mergeSection(BASE, save)
    const touched = sectionFields(save.section, merged)
    expect(sectionChanges(save.section, BASE, merged).changedFields.length).toBeGreaterThan(0)
    for (const other of SAVES.filter((s) => s.section !== save.section)) {
      expect(sectionFields(other.section, merged)).toEqual(sectionFields(other.section, BASE))
    }
    expect(Object.keys(touched).length).toBeGreaterThan(0)
  })

  it("splits the budget section into the budget, the entry check and the Automatic grace floor", () => {
    const merged = mergeSection(BASE, SAVES[1])
    expect(merged.budget).toEqual({ items: 40, bytes: BASE.budget.bytes })
    expect(merged.entryCheck).toEqual({ count: 10, percent: 5 })
    expect(merged.automaticMinGraceDays).toBe(14)
    expect(merged.members.keepDays).toBe(120)
  })
})

describe("sectionChanges", () => {
  it("names the changed fields with dots and keeps booleans and numbers only", () => {
    const after = mergeSection(BASE, {
      section: "cleanup-protections",
      values: { protections: { ...BASE.protections, g4: { enabled: false, days: 30 }, g9: { enabled: true, tags: ["keep", "family"] } } },
    })
    expect(sectionChanges("cleanup-protections", BASE, after)).toEqual({
      changedFields: ["g4.enabled", "g9.tags"],
      before: { "g4.enabled": true },
      after: { "g4.enabled": false },
    })
  })

  it("finds no change in equal lists, and a change in lists of another length or order", () => {
    const same = mergeSection(BASE, { section: "cleanup-protections", values: { protections: { ...BASE.protections, g9: { enabled: true, tags: ["keep"] } } } })
    expect(sectionChanges("cleanup-protections", BASE, same).changedFields).toEqual([])
    const g13 = (collections: string[]) =>
      mergeSection(BASE, { section: "cleanup-protections", values: { protections: { ...BASE.protections, g13: { enabled: false, collections } } } })
    expect(sectionChanges("cleanup-protections", g13(["A", "B"]), g13(["B", "A"])).changedFields).toEqual(["g13.collections"])
    expect(sectionChanges("cleanup-protections", g13(["A"]), g13(["A", "B"])).changedFields).toEqual(["g13.collections"])
  })

  it("names the budget fields as the Settings section shows them", () => {
    expect(Object.keys(sectionFields("cleanup-budget", BASE))).toEqual(["items", "bytes", "entryCheck.count", "entryCheck.percent", "automaticMinGraceDays"])
  })
})

describe("settingsSavedToast", () => {
  it("says a run holds the exits only for exitsApplied false", () => {
    expect(settingsSavedToast({ exitsApplied: false })).toBe(SETTINGS_TOASTS.savedBusy)
    expect(settingsSavedToast({ exitsApplied: true })).toBe("Settings saved")
    expect(settingsSavedToast({ exitsApplied: null })).toBe("Settings saved")
  })
})
