/**
 * @jest-environment node
 */

/**
 * The media cleanup audit summaries (TS 11.3): every row of the table, the
 * parts that are left out, null for details of the wrong shape, and the rule
 * that no free text reaches a line. Support reads these lines but never the
 * details, so a title, a rule name, an item key, a tag, a collection name or a
 * member's name must never show.
 */

import { eventCategory, eventLabel, typesIn } from "@/lib/audit/events"
import { auditSummary } from "@/lib/audit/summary"
import { NO_OWNER_WORDS } from "@/lib/cleanup/blocks"
import { OUTCOME_REASONS } from "@/lib/cleanup/outcomes"
import { bindFormat } from "@/lib/utils/format"
import { GiB } from "@/lib/validations/cleanup-vocabulary"

const f = bindFormat({ timeZone: "America/Chicago", locale: "en-US" })
const summary = (type: string, details: unknown) => auditSummary(type, details, f)

/** Invented ids and keys, in the shapes the writers use. */
const RULE_ID = "clrule000000000000000000a"
const RUN_ID = "clrun0000000000000000000a"
const KEYS = ["movie:tmdb:100001", "movie:tmdb:100002"]

describe("the rule events", () => {
  it.each([
    [{ ruleId: RULE_ID, level: "movie", origin: "recipe", recipeId: "never-watched", recipeVersion: 1, conditions: 3 }, "Movies rule, from a recipe"],
    [{ ruleId: RULE_ID, level: "show", origin: "duplicate", sourceRuleId: "clrule000000000000000000b", conditions: 2 }, "Whole shows rule, duplicated"],
    [{ ruleId: RULE_ID, level: "season", origin: "blank", conditions: 0 }, "Seasons rule"],
    [{ level: "season" }, "Seasons rule"],
    [{ level: "movie", origin: "imported" }, "Movies rule"],
    [{ level: "episode", origin: "recipe" }, null],
    [{ origin: "recipe" }, null],
  ])("summarises CLEANUP_RULE_CREATED %o", (details, expected) => {
    expect(summary("CLEANUP_RULE_CREATED", details)).toBe(expected)
  })

  it.each([
    [{ changed: ["conditions", "then"] }, "Changed: conditions, Then"],
    [{ changed: ["then", "conditions"], impact: { leave: 4, join: 2 } }, "Changed: conditions, Then, 4 leave, 2 join"],
    [{ changed: ["then", "protections", "conditions", "scope", "name"] }, "Changed: name, scope, conditions, protections, Then"],
    [{ changed: ["protections"], impact: { leave: 0, join: 1200 } }, "Changed: protections, 1,200 join"],
    [{ changed: ["scope"], impact: { leave: 3 } }, "Changed: scope, 3 leave"],
    [{ changed: ["name", "name"], impact: "many" }, "Changed: name"],
    [{ changed: ["conditions"], impact: { leave: -1, join: 2 } }, "Changed: conditions, 2 join"],
    [{ changed: ["Somewhere new"] }, null],
    [{ changed: [] }, null],
    [{ changed: "conditions" }, null],
  ])("summarises CLEANUP_RULE_CHANGED %o", (details, expected) => {
    expect(summary("CLEANUP_RULE_CHANGED", { ruleId: RULE_ID, level: "movie", mode: "dryRun", ...details })).toBe(expected)
  })

  it("never reads the definitions before and after a change", () => {
    const definition = { name: "Old movies", conditions: [{ id: "c1", field: "watch.lastPlayed" }] }
    const details = { changed: ["name"], added: ["c2"], removed: ["c1"], edited: [], before: definition, after: definition }

    expect(summary("CLEANUP_RULE_CHANGED", details)).toBe("Changed: name")
  })

  it.each([
    [{ level: "movie", mode: "reviewFirst", released: 12 }, "Deleted a Movies rule, 12 titles released"],
    [{ level: "movie", mode: "automatic", released: 1 }, "Deleted a Movies rule, 1 title released"],
    [{ level: "show", mode: "dryRun", released: 0 }, "Deleted a Whole shows rule"],
    [{ level: "season", released: "all" }, "Deleted a Seasons rule"],
    [{ mode: "dryRun", released: 2 }, null],
  ])("summarises CLEANUP_RULE_DELETED %o", (details, expected) => {
    expect(summary("CLEANUP_RULE_DELETED", { ruleId: RULE_ID, ...details })).toBe(expected)
  })

  it.each([
    [{ from: "dryRun", to: "reviewFirst", joined: 197, typed: false }, "Dry run to Review first, 197 joined"],
    [{ from: "automatic", to: "dryRun", released: 21, typed: false }, "Automatic to Dry run, 21 released"],
    [{ from: "reviewFirst", to: "automatic", joined: 0, released: 0, typed: true }, "Review first to Automatic"],
    [{ from: "dryRun", to: "automatic", joined: 3, released: 1 }, "Dry run to Automatic, 3 joined, 1 released"],
    [{ from: "dryRun", to: "on" }, null],
    [{ to: "dryRun" }, null],
  ])("summarises CLEANUP_RULE_MODE_CHANGED %o", (details, expected) => {
    expect(summary("CLEANUP_RULE_MODE_CHANGED", { ruleId: RULE_ID, ...details })).toBe(expected)
  })
})

describe("the settings and the feature", () => {
  it.each([
    [{ section: "cleanup-budget", changedFields: ["items", "bytes"] }, "cleanup-budget: items, bytes"],
    [{ section: "cleanup-members", changedFields: ["keepDays"] }, "cleanup-members: keepDays"],
    [{ section: "cleanup-feature", changedFields: [] }, "cleanup-feature"],
    [{ changedFields: ["items"] }, null],
  ])("summarises CLEANUP_SETTINGS_CHANGED %o as CONFIG_CHANGED does", (details, expected) => {
    expect(summary("CLEANUP_SETTINGS_CHANGED", { before: { items: 10 }, after: { items: 20 }, ...details })).toBe(expected)
  })

  it("summarises a pause and a resume", () => {
    expect(summary("CLEANUP_PAUSED", { unapproved: 3 })).toBe("Paused")
    expect(summary("CLEANUP_PAUSED", {})).toBe("Paused")
    expect(summary("CLEANUP_RESUMED", { holdUntil: "2026-11-15", moved: 4 })).toBe("Resumed, nothing deleted before Nov 15")
    expect(summary("CLEANUP_RESUMED", { holdUntil: "2026-11-16T05:00:00.000Z" })).toBe("Resumed, nothing deleted before Nov 15")
    expect(summary("CLEANUP_RESUMED", { holdUntil: "soon", moved: 4 })).toBe("Resumed")
    expect(summary("CLEANUP_RESUMED", {})).toBe("Resumed")
  })

  it.each([
    ["run", "Run queued"],
    ["read", "Library read queued"],
    ["dryRun", "Dry run queued"],
    ["purge", null],
  ])("summarises CLEANUP_RUN_STARTED of kind %s", (kind, expected) => {
    expect(summary("CLEANUP_RUN_STARTED", { kind, queued: true, ruleId: RULE_ID })).toBe(expected)
  })
})

describe("CLEANUP_RUN", () => {
  const run = (details: Record<string, unknown>) =>
    summary("CLEANUP_RUN", { runId: RUN_ID, kind: "run", trigger: "scheduled", checked: 900, deferred: 0, ...details })

  it.each([
    [{ outcome: "blocked", blocks: [{ code: "sourceFailed", service: "tautulli" }] }, "Safety stop: Tautulli did not answer"],
    [{ outcome: "blocked", blocks: ["sourceFailed"] }, "Safety stop: A service did not answer"],
    [{ outcome: "blocked", blocks: [{ code: "sourceFailed", service: "plex", errorCode: "NO_OWNER" }] }, NO_OWNER_WORDS.outcome],
    [{ outcome: "blocked", blocks: [{ code: "historyShort", ruleId: RULE_ID, days: 90 }] }, "Safety stop: Tautulli history is shorter than the window of the rule"],
    [{ outcome: "blocked", blocks: [{ code: "newCode" }, { code: "dataStale", hours: 30 }] }, "Safety stop: library data is 30 hours old"],
    [{ outcome: "blocked", blocks: [{ code: "sourceShrank", service: "overseerr", rows: 10, previousRows: 900, counter: "overseerrRequests" }] }, "Safety stop: Overseerr returned 10 requests, 900 before"],
    [{ outcome: "blocked", blocks: [] }, "Safety stop"],
    [{ outcome: "blocked" }, "Safety stop"],
  ])("names a safety stop by its block, %o", (details, expected) => {
    expect(run(details)).toBe(expected)
  })

  it.each([
    [{ outcome: "busy", runId: null }, "Not started: another run was in progress"],
    [{ outcome: "paused", blocks: ["paused"] }, "Paused: nothing changed"],
    [{ outcome: "arrRefused", blocks: [{ code: "arrRefused", service: "radarr" }] }, "Stopped: Radarr refused the API key"],
    [{ outcome: "arrRefused" }, "Stopped: A service refused the API key"],
    [{ outcome: "auditFailed" }, "Stopped: the app did not write an audit row"],
    [{ outcome: "stopped" }, "Stopped: the server shut down"],
    [{ outcome: "noData" }, "Safety stop: no library data yet"],
  ])("names every other stop by its outcome, %o", (details, expected) => {
    expect(run(details)).toBe(expected)
  })

  it.each([
    [{ outcome: "dryRun", kind: "dryRun", matched: 197 }, "Dry run: 197 matches"],
    [{ outcome: "dryRun", kind: "dryRun", matched: 1 }, "Dry run: 1 match"],
    [{ outcome: "dryRun", kind: "dryRun" }, "Dry run"],
  ])("gives a dry run's matches, %o", (details, expected) => {
    expect(run(details)).toBe(expected)
  })

  it.each([
    [{ outcome: "finished", joined: 12, rescued: 2, deleted: 3, failed: 0, freedBytes: String(412 * GiB) }, "Joined 12, rescued 2, deleted 3, up to 412 GB"],
    [{ outcome: "finished", joined: 0, rescued: 1, deleted: 0, failed: 0, freedBytes: "0" }, "Rescued 1"],
    [{ outcome: "finished", deleted: 1, failed: 2, freedBytes: String(Math.round(17.1 * GiB)) }, "Deleted 1, 2 failed, up to 17.1 GB"],
    [{ outcome: "finished", joined: 1500, freedBytes: 2 * GiB }, "Joined 1,500, up to 2 GB"],
    [{ outcome: "finished", joined: 0, rescued: 0, deleted: 0, failed: 0, freedBytes: "0" }, "Nothing changed"],
    [{ outcome: "finished", joined: 2, freedBytes: "a lot", rescued: -1 }, "Joined 2"],
    [{ outcome: "held", held: 52, joined: 3 }, "Held 52 new matches for review, joined 3"],
    [{ outcome: "held", held: 1 }, "Held 1 new match for review"],
    [{ outcome: "held", joined: 4 }, "Joined 4"],
  ])("gives what a run changed, zero parts left out, %o", (details, expected) => {
    expect(run(details)).toBe(expected)
  })

  it("has none for an outcome it does not know", () => {
    expect(run({ outcome: "exploded" })).toBeNull()
    expect(run({ outcome: "off" })).toBeNull()
    expect(summary("CLEANUP_RUN", { runId: RUN_ID, joined: 2 })).toBeNull()
  })
})

describe("the Leaving soon events", () => {
  it.each([
    ["CLEANUP_ITEMS_ENTERED", { runId: RUN_ID, ruleId: RULE_ID, count: 12, itemKeys: KEYS, more: 10 }, "12 titles"],
    ["CLEANUP_ITEMS_ENTERED", { ruleId: RULE_ID, count: 1, itemKeys: KEYS.slice(0, 1), more: 0 }, "1 title"],
    ["CLEANUP_ITEMS_HELD", { runId: RUN_ID, ruleId: RULE_ID, count: 1200, itemKeys: KEYS, more: 700 }, "1,200 titles"],
    ["CLEANUP_ITEMS_HELD", { count: -3 }, null],
    ["CLEANUP_ITEMS_ENTERED", { itemKeys: KEYS }, null],
  ])("counts the titles of %s", (type, details, expected) => {
    expect(summary(type, details)).toBe(expected)
  })

  it.each([
    [{ reason: "ruleOff", count: 12 }, "12 titles, their rule left Leaving soon"],
    [{ reason: "ruleOff", count: 1 }, "1 title, its rule left Leaving soon"],
    [{ reason: "libraryRemoved", count: 3 }, "3 titles, their library left the rule"],
    [{ reason: "libraryRemoved", count: 1 }, "1 title, its library left the rule"],
    [{ reason: "played", count: 2 }, "2 titles"],
    [{ count: 2 }, "2 titles"],
  ])("names the reason of CLEANUP_ITEMS_RELEASED %o", (details, expected) => {
    expect(summary("CLEANUP_ITEMS_RELEASED", { ruleId: RULE_ID, itemKeys: KEYS, more: 0, ...details })).toBe(expected)
  })

  it.each([
    [{ kind: "deletion", count: 6, bytes: 40 * GiB, excluded: 1, typed: true }, "Approved 6 deletions, typed"],
    [{ kind: "deletion", count: 1, typed: false }, "Approved 1 deletion"],
    [{ kind: "entry", count: 52, excluded: 0, typed: false }, "Approved 52 new matches"],
    [{ kind: "entry", count: 1 }, "Approved 1 new match"],
    [{ kind: "deletion", count: 6, typed: "yes" }, "Approved 6 deletions"],
    [{ kind: "everything", count: 6 }, null],
  ])("summarises CLEANUP_BATCH_APPROVED %o", (details, expected) => {
    expect(summary("CLEANUP_BATCH_APPROVED", { ruleId: RULE_ID, keysHash: "a".repeat(64), ...details })).toBe(expected)
  })

  it.each([
    [{ count: 3, days: 14, itemKeys: KEYS, more: 1, skipped: 0 }, "3 titles, 14 days later"],
    [{ count: 1, days: 1, itemKeys: KEYS, more: 0, skipped: 1 }, "1 title, 1 day later, 1 skipped"],
    [{ count: 100, days: 7, batchId: `deletion-${RULE_ID}`, excluded: 2, skipped: 3 }, "100 titles, 7 days later, 3 skipped"],
    [{ count: 3 }, null],
  ])("summarises CLEANUP_ITEMS_POSTPONED %o", (details, expected) => {
    expect(summary("CLEANUP_ITEMS_POSTPONED", details)).toBe(expected)
  })

  it.each([
    [{ count: 2, until: "2027-03-01", hasNote: true, rescued: 2, skipped: 0 }, "2 titles, until Mar 1, 2027"],
    [{ count: 1, until: null, hasNote: false, rescued: 0, skipped: 0 }, "1 title, no end date"],
    [{ count: 5, until: null, skipped: 2 }, "5 titles, no end date, 2 skipped"],
    [{ count: 4, until: "2027-03-01", skipped: 1, batchId: `deletion-${RULE_ID}`, excluded: 1 }, "4 titles, until Mar 1, 2027, 1 skipped"],
    [{ count: 2, until: "next spring" }, "2 titles"],
    [{ until: "2027-03-01" }, null],
  ])("summarises CLEANUP_ITEMS_EXCLUDED %o", (details, expected) => {
    expect(summary("CLEANUP_ITEMS_EXCLUDED", { itemKeys: KEYS, more: 0, ...details })).toBe(expected)
  })

  it("shows a stored day as the day, west of Greenwich too", () => {
    // UTC midnight of 1 March is still 28 February in Chicago; a day key is not an instant
    expect(summary("CLEANUP_ITEMS_EXCLUDED", { count: 1, until: "2027-03-01" })).toBe("1 title, until Mar 1, 2027")
    expect(summary("CLEANUP_EXCLUSION_CHANGED", { change: "endChanged", until: "2027-03-01" })).toBe("End date changed to Mar 1, 2027")
  })
})

describe("exclusions and Keeps", () => {
  it.each([
    [{ change: "removed", until: null }, "Exclusion removed"],
    [{ change: "endChanged", until: "2027-03-01" }, "End date changed to Mar 1, 2027"],
    [{ change: "endChanged", until: null }, "End date removed"],
    [{ change: "endChanged", until: "later" }, "End date changed"],
    [{ change: "renamed" }, null],
  ])("summarises CLEANUP_EXCLUSION_CHANGED %o", (details, expected) => {
    expect(summary("CLEANUP_EXCLUSION_CHANGED", { exclusionId: "clexcl00000000000000000a", itemKey: KEYS[0], ...details })).toBe(expected)
  })

  it.each([
    [{ until: "2027-02-06T18:00:00.000Z" }, "Kept until Feb 6, 2027"],
    // 03:00 UTC on 7 February is still 6 February in the server zone
    [{ until: "2027-02-07T03:00:00Z" }, "Kept until Feb 6, 2027"],
    [{ until: "2027-02-06" }, "Kept until Feb 6, 2027"],
    [{ until: "a while" }, "Kept"],
    [{}, "Kept"],
  ])("summarises CLEANUP_KEEP_ADDED %o", (details, expected) => {
    expect(summary("CLEANUP_KEEP_ADDED", { keepId: "clkeep00000000000000000a", itemKey: KEYS[0], ...details })).toBe(expected)
  })

  it.each([
    [{ endedBy: "self", restored: false }, "Ended by the member"],
    [{ endedBy: "self" }, "Ended by the member"],
    [{ endedBy: "self", restored: true }, "Undone"],
    [{ endedBy: "admin", restored: false }, "Ended by an admin"],
    [{ endedBy: "admin", restored: true }, "Ended by an admin"],
    [{ endedBy: "expired" }, null],
  ])("summarises CLEANUP_KEEP_ENDED %o", (details, expected) => {
    expect(summary("CLEANUP_KEEP_ENDED", { keepId: "clkeep00000000000000000a", itemKey: KEYS[0], ...details })).toBe(expected)
  })
})

describe("the per-item events", () => {
  const rescued = (reason: string, detail?: unknown) =>
    summary("CLEANUP_ITEM_RESCUED", { runId: RUN_ID, itemKey: KEYS[0], level: "movie", reason, ruleIds: [RULE_ID], detail })

  it.each([
    ["played", "A member played it"],
    ["kept", "A member kept it"],
    ["excluded", "You excluded it"],
    ["markedKeepForever", "A member marked it Keep forever"],
    ["requested", "A member requested it"],
    ["newContent", "New episodes arrived"],
    ["notManaged", "Radarr or Sonarr no longer matches it"],
    ["recordChanged", "Its Radarr or Sonarr record changed"],
    ["notInLibrary", "It left Plex"],
    ["ruleOff", "Its rule left Leaving soon"],
    ["libraryRemoved", "Its library left the rule"],
  ])("gives the reason words of %s", (reason, expected) => {
    expect(rescued(reason)).toBe(expected)
  })

  it("uses the fixed words where the reason words need an id", () => {
    expect(rescued("protected", { protectionId: "g4" })).toBe("A protection keeps it safe")
    expect(rescued("conditionFailed", { conditionId: "c2" })).toBe("It no longer matches")
    expect(rescued("recordChanged", { code: "seasonMismatch" })).toBe("Its Radarr or Sonarr record changed")
    expect(rescued("failed", { code: "HTTP" })).toBe("The delete failed")
  })

  it("names a record that a failed delete left unmonitored", () => {
    expect(rescued("notManaged", { stillUnmonitored: "radarr" })).toBe("Radarr or Sonarr no longer matches it. Still unmonitored in Radarr")
    expect(rescued("played", { stillUnmonitored: "plex" })).toBe("A member played it")
  })

  it("has words for every reason, and none for a reason it does not know", () => {
    for (const reason of OUTCOME_REASONS) expect(rescued(reason)).toEqual(expect.stringMatching(/^[A-Z].*[^.]$/))
    expect(rescued("somethingNew")).toBeNull()
    expect(rescued("toString")).toBeNull()
  })

  it.each([
    [{ service: "radarr", freedBytes: String(Math.round(17.1 * GiB)), alreadyGone: false }, "Deleted in Radarr, up to 17.1 GB"],
    [{ service: "sonarr", freedBytes: "0", alreadyGone: true }, "Already gone in Sonarr"],
    [{ service: "sonarr", freedBytes: "0", alreadyGone: false }, "Deleted in Sonarr"],
    [{ service: "radarr", freedBytes: "lots" }, "Deleted in Radarr"],
    [{ service: "plex", freedBytes: "0" }, null],
  ])("summarises CLEANUP_ITEM_DELETED %o", (details, expected) => {
    const stored = { runId: RUN_ID, itemKey: KEYS[0], level: "movie", action: "movie.delete", arrId: 7, ruleIds: [RULE_ID] }

    expect(summary("CLEANUP_ITEM_DELETED", { ...stored, importListExclusion: false, approval: "automatic", ...details })).toBe(expected)
  })

  it.each([
    [{ service: "radarr", code: "HTTP", status: 500 }, "Radarr returned HTTP 500"],
    [{ service: "radarr", code: "HTTP" }, "Radarr returned HTTP error"],
    [{ service: "radarr", code: "HTTP", status: 9000 }, "Radarr returned HTTP error"],
    [{ service: "sonarr", code: "TIMEOUT" }, "Sonarr did not respond in time"],
    [{ service: "sonarr", code: "NETWORK" }, "Could not reach Sonarr"],
    [{ service: "sonarr", code: "INVALID_RESPONSE" }, "Sonarr sent an unexpected response"],
    [{ service: "sonarr", code: "UPSTREAM_ERROR" }, "Sonarr reported an error"],
    [{ service: "sonarr", code: "noSeasonNumber" }, "The season has no number"],
    [{ service: "sonarr", code: "noArrSeason" }, "Sonarr has no such season"],
    [{ service: "sonarr", code: "outsideArrPath" }, "The file is outside Sonarr's root folders"],
    [{ service: "sonarr", code: "sourceFailed:plex" }, "Plex did not answer"],
    [{ service: "sonarr", code: "sourceFailed:somewhere" }, "The delete failed"],
    [{ service: "sonarr", code: "SOMETHING_NEW" }, "The delete failed"],
    [{ code: "HTTP", status: 500 }, null],
  ])("summarises CLEANUP_ITEM_FAILED %o", (details, expected) => {
    const stored = { runId: RUN_ID, itemKey: KEYS[0], level: "season", action: "season.unmonitorDeleteFiles", failCount: 2 }

    expect(summary("CLEANUP_ITEM_FAILED", { ...stored, ...details })).toBe(expected)
  })
})

/** One stored row of every event type of TS 11.1, and its summary. */
const SAMPLES: Record<string, [Record<string, unknown>, string]> = {
  CLEANUP_RULE_CREATED: [{ ruleId: RULE_ID, level: "movie", origin: "recipe", recipeId: "never-watched", recipeVersion: 1, conditions: 2 }, "Movies rule, from a recipe"],
  CLEANUP_RULE_CHANGED: [{ ruleId: RULE_ID, level: "movie", mode: "reviewFirst", changed: ["conditions"], added: ["c3"], removed: [], edited: ["c1"], before: {}, after: {}, impact: { leave: 4, join: 2 } }, "Changed: conditions, 4 leave, 2 join"],
  CLEANUP_RULE_DELETED: [{ ruleId: RULE_ID, level: "show", mode: "reviewFirst", released: 2 }, "Deleted a Whole shows rule, 2 titles released"],
  CLEANUP_RULE_MODE_CHANGED: [{ ruleId: RULE_ID, from: "dryRun", to: "reviewFirst", joined: 197, typed: false }, "Dry run to Review first, 197 joined"],
  CLEANUP_SETTINGS_CHANGED: [{ section: "cleanup-budget", changedFields: ["items", "bytes"], before: {}, after: {} }, "cleanup-budget: items, bytes"],
  CLEANUP_PAUSED: [{ unapproved: 3 }, "Paused"],
  CLEANUP_RESUMED: [{ holdUntil: "2026-11-15", moved: 4 }, "Resumed, nothing deleted before Nov 15"],
  CLEANUP_RUN_STARTED: [{ kind: "read", queued: true }, "Library read queued"],
  CLEANUP_RUN: [{ runId: RUN_ID, kind: "run", trigger: "scheduled", outcome: "finished", checked: 9, joined: 2, held: 0, rescued: 0, deleted: 1, failed: 0, deferred: 0, freedBytes: String(GiB), blocks: [] }, "Joined 2, deleted 1, up to 1 GB"],
  CLEANUP_ITEMS_ENTERED: [{ runId: RUN_ID, ruleId: RULE_ID, count: 2, itemKeys: KEYS, more: 0 }, "2 titles"],
  CLEANUP_ITEMS_HELD: [{ runId: RUN_ID, ruleId: RULE_ID, count: 2, itemKeys: KEYS, more: 0 }, "2 titles"],
  CLEANUP_ITEMS_RELEASED: [{ ruleId: RULE_ID, reason: "libraryRemoved", count: 2, itemKeys: KEYS, more: 0 }, "2 titles, their library left the rule"],
  CLEANUP_BATCH_APPROVED: [{ kind: "deletion", ruleId: RULE_ID, count: 2, bytes: GiB, excluded: 0, keysHash: "b".repeat(64), typed: false }, "Approved 2 deletions"],
  CLEANUP_ITEMS_POSTPONED: [{ count: 2, days: 14, itemKeys: KEYS, more: 0, skipped: 0 }, "2 titles, 14 days later"],
  CLEANUP_ITEMS_EXCLUDED: [{ count: 2, until: null, hasNote: true, rescued: 1, skipped: 1, itemKeys: KEYS, more: 0 }, "2 titles, no end date, 1 skipped"],
  CLEANUP_EXCLUSION_CHANGED: [{ exclusionId: "clexcl00000000000000000a", itemKey: KEYS[0], change: "removed", until: null }, "Exclusion removed"],
  CLEANUP_KEEP_ADDED: [{ keepId: "clkeep00000000000000000a", itemKey: KEYS[0], until: "2027-02-06T18:00:00.000Z" }, "Kept until Feb 6, 2027"],
  CLEANUP_KEEP_ENDED: [{ keepId: "clkeep00000000000000000a", itemKey: KEYS[0], endedBy: "self", restored: true }, "Undone"],
  CLEANUP_ITEM_RESCUED: [{ runId: RUN_ID, itemKey: KEYS[0], level: "movie", reason: "played", ruleIds: [RULE_ID] }, "A member played it"],
  CLEANUP_ITEM_DELETED: [{ runId: RUN_ID, itemKey: KEYS[0], level: "movie", action: "movie.delete", service: "radarr", arrId: 7, ruleIds: [RULE_ID], freedBytes: String(GiB), alreadyGone: false, importListExclusion: true, approval: "admin" }, "Deleted in Radarr, up to 1 GB"],
  CLEANUP_ITEM_FAILED: [{ runId: RUN_ID, itemKey: KEYS[0], level: "movie", action: "movie.delete", service: "radarr", code: "HTTP", status: 500, failCount: 1 }, "Radarr returned HTTP 500"],
}

describe("every media cleanup event", () => {
  it("has a label, the cleanup category and a summary", () => {
    expect(Object.keys(SAMPLES)).toEqual(typesIn("cleanup"))
    for (const [type, [details, expected]] of Object.entries(SAMPLES)) {
      expect(eventCategory(type)).toBe("cleanup")
      expect(eventLabel(type)).not.toBe(type)
      expect(summary(type, details)).toBe(expected)
    }
  })

  it("has none for details that are not an object", () => {
    for (const type of typesIn("cleanup")) {
      expect(summary(type, null)).toBeNull()
      expect(summary(type, ["count", 2])).toBeNull()
    }
  })

  const TITLE = "The Invented Picture (2031)"
  const RULE_NAME = "Old movies nobody likes"
  const ITEM_KEY = "movie:tmdb:fake123"
  const TAG = "7 - jane.doe"
  const COLLECTION = "Halloween Classics"
  const MEMBER = "Jane Doe"
  const FREE_TEXT = [TITLE, RULE_NAME, ITEM_KEY, TAG, COLLECTION, MEMBER]
  const BESIDE = {
    title: TITLE, ruleName: RULE_NAME, name: RULE_NAME, itemKey: ITEM_KEY, itemKeys: [ITEM_KEY], tag: TAG, tags: [TAG],
    collection: COLLECTION, member: MEMBER, before: { name: RULE_NAME, title: TITLE }, after: { name: RULE_NAME, tag: TAG },
  }

  it.each(Object.keys(SAMPLES))("never shows a title, a rule name, an item key, a tag, a collection or a name beside the %s details", (type) => {
    const line = summary(type, { ...SAMPLES[type][0], ...BESIDE }) ?? ""

    for (const text of FREE_TEXT) expect(line).not.toContain(text)
  })

  it.each(Object.keys(SAMPLES))("never echoes free text put in a key that %s reads", (type) => {
    const [details] = SAMPLES[type]
    for (const key of Object.keys(details)) {
      for (const text of FREE_TEXT) {
        for (const value of [text, [text], { code: text, service: text }]) {
          const line = summary(type, { ...details, [key]: value }) ?? ""

          expect(line).not.toContain(text)
        }
      }
    }
  })

  it("never echoes free text inside a stored block or an outcome detail", () => {
    const blocks = [{ code: TITLE }, { code: "sourceFailed", service: MEMBER }, { code: "historyShort", ruleId: RULE_NAME }]
    const line = summary("CLEANUP_RUN", { runId: RUN_ID, outcome: "blocked", blocks }) ?? ""
    const reason = summary("CLEANUP_ITEM_RESCUED", { reason: "conditionFailed", detail: { conditionId: RULE_NAME, protectionId: TAG, code: TITLE } }) ?? ""

    for (const text of FREE_TEXT) {
      expect(line).not.toContain(text)
      expect(reason).not.toContain(text)
    }
    expect(line).toBe("Safety stop: Tautulli history is shorter than the window of the rule")
    expect(reason).toBe("It no longer matches")
  })
})
