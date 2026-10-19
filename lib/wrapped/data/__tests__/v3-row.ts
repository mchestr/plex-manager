/** A minimal valid v3 `PlexWrapped.data` value, for parser tests. */
export function minimalV3() {
  return {
    version: 3,
    year: 2026,
    statsVersion: "stats-2026.1",
    generatedAt: "2026-12-01T00:20:00.000Z",
    window: { from: "2026-01-01", through: "2026-11-30", zone: "America/Chicago", finalCut: false },
    edition: "postcard",
    facts: { "time.totalMinutes": { value: 12, display: "12 minutes", unit: "duration" } },
    pages: [{ type: "cover", data: {} }],
    archetype: null,
    copy: null,
    copySource: "template",
    copyMeta: { model: null, promptVersion: "rewind-2026.1", slotHashes: {} },
    factsHash: "0".repeat(64),
  }
}
