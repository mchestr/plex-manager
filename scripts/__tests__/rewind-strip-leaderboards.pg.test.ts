/**
 * @jest-environment node
 */

/**
 * The roster clean-up CLI against a real PostgreSQL database (P0.20).
 *
 * Runs only when TEST_DATABASE_URL is set; a URL whose database name does not
 * end in `_test` fails the suite before any connection is made (P0.4's
 * `assertTestDatabaseUrl`). The suite empties the PlexWrapped, LLMUsage,
 * ChatConversation and WrappedShareVisit tables of that database, because the
 * script scans every row.
 *
 *   TEST_DATABASE_URL=postgresql://.../plex_manager_test npx jest scripts/__tests__/rewind-strip-leaderboards.pg.test.ts
 */

import { PrismaPg } from "@prisma/adapter-pg"

import { PrismaClient } from "@/lib/generated/prisma/client"
import { assertTestDatabaseUrl } from "@/lib/security/test-mode"
import { buildLeaderboards, buildStatistics, LEADERBOARD_MEMBER_EMAIL } from "@/lib/wrapped/__tests__/fixtures"
import { toShareSafeV2 } from "@/lib/wrapped/data/share-safe-v2"
import { main } from "@/scripts/rewind-strip-leaderboards"

const testDatabaseUrl = process.env.TEST_DATABASE_URL === undefined ? undefined : assertTestDatabaseUrl(process.env.TEST_DATABASE_URL)
const describePg = testDatabaseUrl === undefined ? describe.skip : describe

const ID = "p020"
const OWNER_EMAIL = "mike@example.com"
const LEGACY_ERROR = `User not found in Tautulli. Plex User ID: 7, Email: jane@example.com. Available users: jsnow (${LEADERBOARD_MEMBER_EMAIL}), asmith (no email)`

const { derived: _derived, percentile: _percentile, ...v1Statistics } = buildStatistics()

const v1Data = {
  year: 2024,
  userId: `${ID}-mike`,
  userName: OWNER_EMAIL,
  statistics: { ...v1Statistics, leaderboards: buildLeaderboards() },
  sections: [{ id: "hero", type: "hero", title: "2024", content: `Welcome back, ${OWNER_EMAIL}!` }],
  summary: `${OWNER_EMAIL} watched 85 films`,
}

const v2Data = (userName: string, withLeaderboards: boolean) => ({
  version: 2,
  year: 2025,
  userId: `${ID}-user`,
  userName,
  statistics: withLeaderboards ? { ...buildStatistics(), leaderboards: buildLeaderboards() } : buildStatistics(),
  sections: [{ id: "hero", type: "hero", title: "2025", content: "What a year." }],
  summary: "85 films, Top 5% of the server.",
})

async function emptyTables(db: PrismaClient) {
  await db.wrappedShareVisit.deleteMany()
  await db.lLMUsage.deleteMany()
  await db.chatConversation.deleteMany()
  await db.plexWrapped.deleteMany()
  await db.user.deleteMany({ where: { id: { startsWith: `${ID}-` } } })
}

async function seed(db: PrismaClient) {
  await db.user.createMany({
    data: [
      { id: `${ID}-mike`, name: "Mike", email: OWNER_EMAIL },
      { id: `${ID}-jane`, name: "jane@example.com", email: "jane@example.com" },
      { id: `${ID}-jelly`, name: "Jelly", email: null },
    ],
  })
  const completed = { status: "completed", generatedAt: new Date("2025-12-01T00:00:00Z") }
  await db.plexWrapped.createMany({
    data: [
      // v1 with a roster, the owner's email as its name and in its text, and a visited token
      { id: `${ID}-w1`, userId: `${ID}-mike`, year: 2024, ...completed, data: JSON.stringify(v1Data), summary: `${OWNER_EMAIL} watched 85 films`, shareToken: `${ID}-visited` },
      // v2 with a roster and a token nobody visited
      { id: `${ID}-w2`, userId: `${ID}-mike`, year: 2025, ...completed, data: JSON.stringify(v2Data("Mike", true)), summary: "Mike's 2025", archetype: "Midnight Marathoner", shareToken: `${ID}-unvisited` },
      // v2 whose stored name is an email, with a token visited only since P0.8
      { id: `${ID}-w3`, userId: `${ID}-jane`, year: 2025, ...completed, data: JSON.stringify(v2Data("jane@example.com", false)), shareToken: `${ID}-new-visit` },
      { id: `${ID}-w4`, userId: `${ID}-jane`, year: 2024, status: "failed", data: "{}", error: LEGACY_ERROR },
      { id: `${ID}-w5`, userId: `${ID}-jelly`, year: 2025, status: "failed", data: "not json", error: "LLM provider timed out" },
      { id: `${ID}-w6`, userId: `${ID}-jelly`, year: 2024, ...completed, data: JSON.stringify(v2Data("Jelly", false)) },
    ],
  })
  await db.wrappedShareVisit.createMany({
    data: [
      { id: `${ID}-legacy-visit`, wrappedId: `${ID}-w1`, ipAddress: "3f2a9c", userAgent: "Mozilla/5.0", referer: "https://chat.example" },
      { id: `${ID}-new-visit`, wrappedId: `${ID}-w3` },
    ],
  })
  await db.chatConversation.create({ data: { id: `${ID}-chat`, userId: `${ID}-mike` } })
  const usage = { provider: "openai", model: "gpt-5-mini", promptTokens: 10, completionTokens: 5, totalTokens: 15, cost: 0.01 }
  await db.lLMUsage.createMany({
    data: [
      { id: `${ID}-rewind-run`, userId: `${ID}-mike`, wrappedId: `${ID}-w1`, ...usage, prompt: `Stats for ${OWNER_EMAIL}. Top watcher ${LEADERBOARD_MEMBER_EMAIL}`, response: '{"summary":"..."}' },
      { id: `${ID}-playground`, userId: `${ID}-mike`, ...usage, prompt: "Playground prompt with a roster", response: "{}" },
      { id: `${ID}-chat-call`, userId: `${ID}-mike`, chatConversationId: `${ID}-chat`, ...usage, prompt: '[{"role":"user","content":"hi"}]', response: "Hello!" },
    ],
  })
}

/** Every row the script may touch, in a stable order. */
async function snapshot(db: PrismaClient) {
  return {
    wrapped: await db.plexWrapped.findMany({ orderBy: { id: "asc" } }),
    llmUsage: await db.lLMUsage.findMany({ orderBy: { id: "asc" } }),
    visits: await db.wrappedShareVisit.findMany({ orderBy: { id: "asc" } }),
  }
}

async function run(db: PrismaClient, argv: string[]) {
  const lines: string[] = []
  const code = await main(argv, db, (line) => lines.push(line))
  return { code, lines }
}

const EXPECTED_COUNTS = [
  "1. Stored data     scanned 6, changed 3, unparsable 1",
  "2. LLM text        scanned 2, changed 2",
  "3. Errors          scanned 2, changed 1",
  "4. Share tokens    scanned 3, changed 1",
  "5. Legacy visits   scanned 2, changed 1",
]

describePg("rewind:strip-leaderboards against PostgreSQL", () => {
  jest.setTimeout(60_000)

  let db: PrismaClient

  beforeAll(async () => {
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: testDatabaseUrl }) })
    await emptyTables(db)
    await seed(db)
  })

  afterAll(async () => {
    await emptyTables(db)
    await db.$disconnect()
  })

  it("reports the counts in a dry run and changes nothing", async () => {
    const before = await snapshot(db)

    const { code, lines } = await run(db, [])

    expect(code).toBe(0)
    expect(lines).toEqual([
      "Rewind roster clean-up: dry run, nothing written (pass --apply to write).",
      ...EXPECTED_COUNTS,
    ])
    expect(await snapshot(db)).toEqual(before)
  })

  it("applies the same counts with --apply", async () => {
    const { code, lines } = await run(db, ["--apply"])

    expect(code).toBe(0)
    expect(lines).toEqual([
      "Rewind roster clean-up: applied.",
      `${EXPECTED_COUNTS[0]}, skipped 0`,
      ...EXPECTED_COUNTS.slice(1),
    ])
  })

  it("leaves no roster, no owner email as a name and no roster error in stored rows", async () => {
    const rows = new Map((await db.plexWrapped.findMany()).map((row) => [row.id, row]))
    const w1 = rows.get(`${ID}-w1`)!
    const w1Data = JSON.parse(w1.data)

    for (const id of ["w1", "w2", "w3", "w6"]) {
      const row = rows.get(`${ID}-${id}`)!
      expect(JSON.parse(row.data).statistics).not.toHaveProperty("leaderboards")
      expect(row.data).not.toContain(LEADERBOARD_MEMBER_EMAIL)
      expect(row.data).not.toContain("Alice Smith")
      expect(row.data).not.toContain("@")
    }
    expect(w1Data.userName).toBe("Mike")
    expect(w1Data.sections[0].content).toBe("Welcome back, Mike!")
    expect(w1Data.summary).toBe("Mike watched 85 films")
    expect(w1.summary).toBe("Mike watched 85 films")
    expect(JSON.parse(rows.get(`${ID}-w2`)!.data).statistics.percentile).toEqual({ percentile: 5, topPercentLabel: "Top 5%" })
    expect(JSON.parse(rows.get(`${ID}-w3`)!.data).userName).toBe("Viewer")

    expect(rows.get(`${ID}-w4`)!.error).toBe('{"code":"TAUTULLI_USER_NOT_FOUND"}')
    expect(rows.get(`${ID}-w5`)!.data).toBe("not json")
    expect(rows.get(`${ID}-w5`)!.error).toBe("LLM provider timed out")
  })

  it("keeps the share projection working on the stripped rows", async () => {
    const w2 = await db.plexWrapped.findUniqueOrThrow({ where: { id: `${ID}-w2` }, include: { user: { select: { name: true } } } })

    expect(toShareSafeV2(w2, w2.user)).toMatchObject({ year: 2025, ownerName: "Mike", archetypeName: "Midnight Marathoner" })
  })

  it("nulls Rewind and playground LLM text and keeps the chat call's text", async () => {
    const usage = new Map((await db.lLMUsage.findMany()).map((row) => [row.id, row]))

    expect(usage.get(`${ID}-rewind-run`)).toMatchObject({ prompt: null, response: null, totalTokens: 15, cost: 0.01 })
    expect(usage.get(`${ID}-playground`)).toMatchObject({ prompt: null, response: null })
    expect(usage.get(`${ID}-chat-call`)).toMatchObject({ prompt: '[{"role":"user","content":"hi"}]', response: "Hello!" })
  })

  it("revokes only the unvisited token and deletes only the legacy visit", async () => {
    const tokens = await db.plexWrapped.findMany({ where: { shareToken: { not: null } }, orderBy: { id: "asc" }, select: { id: true, shareToken: true } })
    const visits = await db.wrappedShareVisit.findMany({ select: { id: true } })

    expect(tokens).toEqual([
      { id: `${ID}-w1`, shareToken: `${ID}-visited` },
      { id: `${ID}-w3`, shareToken: `${ID}-new-visit` },
    ])
    expect(visits).toEqual([{ id: `${ID}-new-visit` }])
  })

  it("reports zeros on a second --apply and leaves every row byte-identical", async () => {
    const before = await snapshot(db)

    const { code, lines } = await run(db, ["--apply"])

    expect(code).toBe(0)
    expect(lines).toEqual([
      "Rewind roster clean-up: applied.",
      "1. Stored data     scanned 6, changed 0, unparsable 1, skipped 0",
      "2. LLM text        scanned 2, changed 0",
      "3. Errors          scanned 2, changed 0",
      "4. Share tokens    scanned 2, changed 0",
      "5. Legacy visits   scanned 1, changed 0",
    ])
    expect(await snapshot(db)).toEqual(before)
  })
})
