/**
 * Invented Settings tab data for the section tests. Titles, tags and
 * collection names are made up.
 */

import { buildOptions } from "@/lib/cleanup/__tests__/helpers/builders"
import { GLOBAL_PROTECTION_IDS } from "@/lib/cleanup/constants"
import { globalProtectionSentence } from "@/lib/cleanup/preview/protection-words"
import type { SettingsProtection } from "@/lib/cleanup/types/list-parts"
import type { CleanupSettingsData } from "@/lib/cleanup/types/screens"
import type { CleanupOptions } from "@/lib/validations/cleanup-options"

/** 2026-11-08 12:00 UTC: the render clock of every test. */
export const NOW = Date.parse("2026-11-08T12:00:00.000Z")
export const READ_AT = "2026-11-08T03:07:00.000Z"

const COUNTS: Partial<Record<SettingsProtection["id"], number>> = {
  g1: 23, g2: 4, g3: 8, g4: 212, g5: 96, g6: 141, g7: 38, g8: 9, g9: 41, g10: 19, g11: 147, g12: 33,
}

/** The thirteen rows as the loader gives them, with the counts of `shots/10-settings.png`. */
export function buildProtections(options: CleanupOptions, overrides: Partial<Record<SettingsProtection["id"], Partial<SettingsProtection>>> = {}): SettingsProtection[] {
  return GLOBAL_PROTECTION_IDS.map((id) => ({
    id,
    sentence: globalProtectionSentence(id, options.protections),
    alwaysOn: id === "g1" || id === "g3",
    protects: id === "g13" && !options.protections.g13.enabled ? null : (COUNTS[id] ?? 0),
    unit: id === "g11" || id === "g12" ? "seasons" : "titles",
    needsMissing: [],
    seasonsOnly: id === "g11" || id === "g12",
    ...overrides[id],
  }))
}

/** The Settings tab data: on since Oct 9, 2026, the library read at 3:07 AM today, the job queue set up. */
export function buildSettingsData(overrides: Partial<CleanupSettingsData> = {}, options: CleanupOptions = buildOptions()): CleanupSettingsData {
  return {
    options,
    feature: {
      enabled: true,
      enabledAt: "2026-10-09T17:00:00.000Z",
      pausedAt: null,
      pausedBy: null,
      redis: true,
      holdUntil: "2026-10-16",
    },
    schedule: { nextRunAt: "2026-11-09T03:07:00.000Z", zone: "UTC" },
    libraryData: {
      startedAt: "2026-11-08T03:04:46.000Z",
      finishedAt: READ_AT,
      sources: [
        { service: "plex", state: "ok", readAt: READ_AT },
        { service: "tautulli", state: "ok", readAt: READ_AT },
        { service: "overseerr", state: "ok", readAt: READ_AT },
        { service: "radarr", state: "ok", readAt: READ_AT },
        { service: "sonarr", state: "ok", readAt: READ_AT },
      ],
      historyStart: "2022-06-14T00:00:00.000Z",
      reading: false,
    },
    lastRun: { id: "run-1", startedAt: READ_AT, outcome: "finished", blocks: [] },
    protections: buildProtections(options),
    tagOptions: ["4k", "keep", "kids"],
    collectionOptions: ["Christmas Movies", "Halloween Movies", "Staff Picks"],
    kometaSuggestion: { names: ["Christmas Movies", "Halloween Movies"], library: "Movies" },
    watchlistMembers: 2,
    plex: {
      working: true,
      checkedAt: READ_AT,
      collections: [
        { level: "movie", sectionId: "1", title: "Movies leaving soon", count: 0 },
        { level: "show", sectionId: "2", title: "Shows leaving soon", count: 21 },
        { level: "season", sectionId: "2", title: "Seasons leaving soon", count: 31 },
      ],
      summary: "These titles leave Example Server soon, the soonest first.",
      notices: [],
    },
    ...overrides,
  }
}
