/**
 * Invented preview data for the preview, Results and Why part tests. Titles
 * and names are made up. Sizes are whole numbers of bytes, as the server sends them.
 */

import type { ClauseLabel } from "@/components/admin/cleanup/preview/clause-labels"
import type { ItemRef, PreviewResponse, PreviewRow, WhySheetData } from "@/lib/cleanup/types/preview"

/** 2026-11-08 12:00 UTC: the render clock of every test. */
export const NOW = Date.parse("2026-11-08T12:00:00.000Z")
export const TAKEN_AT = "2026-11-08T03:07:00.000Z"

export function buildRef(overrides: Partial<ItemRef> = {}): ItemRef {
  return {
    itemKey: "movie-1001",
    level: "movie",
    title: "Harbor Lights",
    year: 2022,
    seasonNumber: null,
    episodeCount: null,
    seasonCount: null,
    posterKey: null,
    sectionId: "1",
    sizeBytes: String(Math.round(22.4 * 1024 ** 3)),
    ...overrides,
  }
}

export function buildRow(overrides: Partial<PreviewRow> = {}): PreviewRow {
  return {
    ...buildRef(),
    class: "match",
    why: [{ text: "Never played.", strong: true }, { text: " Added Feb 2023. Nobody requested it." }],
    lastPlayedAt: "never",
    addedAt: "2023-02-09T10:00:00.000Z",
    requestedBy: "none",
    ...overrides,
  }
}

export const LABELS: ClauseLabel[] = [
  { id: "c1", name: "Added", sentence: "Added more than 365 days ago" },
  { id: "c2", name: "Last played", sentence: "Last played more than 365 days ago, or never" },
  { id: "a1", name: "Any of these", sentence: "Any of: requested in Overseerr: no, or requested by only former members" },
  { id: "c3", name: "Size", sentence: "Size more than 80 GB" },
]

export const GLOBALS: Record<string, string> = { g4: "Played in the last 30 days" }

export function buildPreview(overrides: Partial<PreviewResponse> = {}): PreviewResponse {
  return {
    level: "movie",
    snapshot: { id: "snap-1", takenAt: TAKEN_AT, historyStart: "2022-06-14T00:00:00.000Z" },
    sources: [
      { service: "plex", state: "ok", readAt: TAKEN_AT, part: "server" },
      { service: "tautulli", state: "ok", readAt: TAKEN_AT },
      { service: "overseerr", state: "ok", readAt: "2026-11-08T03:06:00.000Z" },
      { service: "radarr", state: "ok", readAt: TAKEN_AT },
      { service: "sonarr", state: "notConfigured", readAt: null },
    ],
    checked: 777,
    matches: 197,
    bytes: String(Math.round(1.3 * 1024 ** 4)),
    growthWeeks: 4,
    clauses: [
      { id: "c1", passAlone: 640, heldBack: 22 },
      { id: "c2", passAlone: 478, heldBack: 13 },
      { id: "a1", passAlone: 560, heldBack: 6 },
    ],
    allConditions: 214,
    protectedAll: 17,
    protectedGlobal: 12,
    protectedBy: [{ protectionId: "g4", count: 12 }],
    tabs: { matches: 197, nearMisses: 41, protected: 17, missing: 4, cannotDelete: 3 },
    rows: [
      buildRow(),
      buildRow({
        itemKey: "movie-1002",
        title: "Paper Crowns",
        year: 2023,
        sizeBytes: String(Math.round(17.1 * 1024 ** 3)),
        requestedBy: [{ name: "Avery Lark", status: "former", at: "2024-03-03T00:00:00.000Z" }],
      }),
    ],
    page: 1,
    pageCount: 4,
    total: 197,
    largest: [
      { ...buildRef(), why: [{ text: "Never played.", strong: true }] },
      { ...buildRef({ itemKey: "movie-1002", title: "Paper Crowns", year: 2023 }), why: [{ text: "Never played.", strong: true }] },
    ],
    warnings: [],
    incomplete: [],
    blocks: [],
    sentence: [{ text: "Movies in the " }, { text: "Movies", strong: true }, { text: " library." }],
    ...overrides,
  }
}

export function buildWhy(overrides: Partial<WhySheetData> = {}): WhySheetData {
  return {
    item: buildRef(),
    state: "match",
    addedAt: null,
    links: { plexUrl: null, arrUrl: null },
    conditions: [],
    hints: [],
    protections: [],
    otherRules: [],
    sources: [],
    ...overrides,
  }
}
