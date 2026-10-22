/**
 * @jest-environment node
 */

/**
 * The `p1116_discord_command_log_args_length` data migration against a real
 * PostgreSQL database (P11.16, GAP-32): existing CHAT rows lose the text a
 * member typed and keep its length; other commands keep their arguments.
 *
 * The test database is already migrated, so only the migration's UPDATE runs
 * here, inside a transaction that is rolled back. Gated by `describePg`; run
 * with `npm run test:integration`.
 */

import { readFileSync } from "node:fs"
import path from "node:path"

import { PrismaPg } from "@prisma/adapter-pg"

import { PrismaClient } from "@/lib/generated/prisma/client"
import { describePg } from "@/test/helpers/integration"

const MIGRATION = path.join(
  __dirname,
  "..",
  "migrations",
  "20270116000006_p1116_discord_command_log_args_length",
  "migration.sql"
)

/** The migration's data statements (the column already exists in the test database). */
function updates(): string[] {
  return readFileSync(MIGRATION, "utf8")
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n")
    .split(";")
    .map((statement) => statement.trim())
    .filter((statement) => statement.startsWith("UPDATE"))
}

class Rollback extends Error {}

const base = { discordUserId: "p1116-user", channelId: "p1116-channel", channelType: "dm", status: "SUCCESS" as const }

describePg("discord_command_log_args_length migration", (databaseUrl) => {
  let db: PrismaClient

  beforeAll(() => {
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) })
  })

  afterAll(async () => {
    await db.$disconnect()
  })

  it("nulls existing CHAT text, keeps its length, and leaves other commands alone", async () => {
    expect(updates()).toHaveLength(1)

    let rows: { id: string; commandArgs: string | null; argsLength: number | null }[] = []
    await db
      .$transaction(async (tx) => {
        await tx.discordCommandLog.createMany({
          data: [
            { ...base, id: "p1116-chat", commandType: "CHAT", commandName: "dm", commandArgs: "what should I watch tonight?" },
            { ...base, id: "p1116-chat-empty", commandType: "CHAT", commandName: "assistant", commandArgs: null },
            { ...base, id: "p1116-mark", commandType: "MEDIA_MARK", commandName: "/mark finished", commandArgs: "Heat" },
          ],
        })
        for (const statement of updates()) await tx.$executeRawUnsafe(statement)
        rows = await tx.discordCommandLog.findMany({
          where: { id: { startsWith: "p1116-" } },
          select: { id: true, commandArgs: true, argsLength: true },
          orderBy: { id: "asc" },
        })
        throw new Rollback()
      })
      .catch((error: unknown) => {
        if (!(error instanceof Rollback)) throw error
      })

    expect(rows).toEqual([
      { id: "p1116-chat", commandArgs: null, argsLength: "what should I watch tonight?".length },
      { id: "p1116-chat-empty", commandArgs: null, argsLength: null },
      { id: "p1116-mark", commandArgs: "Heat", argsLength: null },
    ])
  })
})
