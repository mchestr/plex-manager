/**
 * @jest-environment node
 */

/**
 * `?schema=` in DATABASE_URL against a real PostgreSQL database (P11.6,
 * GAP-19): `prisma migrate deploy` and the app's client use the same schema.
 *
 * Migrates schema `pm_schema_test` from empty, writes a Config row through
 * `createPrismaClient()` and finds it in that schema's table, not in
 * `public`'s. Drops the schema afterwards. Gated by `describePg`; run with
 * `npm run test:integration`.
 */

import { execFileSync } from "node:child_process"
import path from "node:path"

import { Client } from "pg"

import { describePg } from "@/__tests__/helpers/integration"

const SCHEMA = "pm_schema_test"
const ROOT = path.join(__dirname, "..", "..")
const ROW = `p116-${process.pid}`

describePg("?schema= in DATABASE_URL", (databaseUrl) => {
  let schemaUrl: string
  let pg: Client
  const originalUrl = process.env.DATABASE_URL

  beforeAll(async () => {
    const url = new URL(databaseUrl)
    url.searchParams.set("schema", SCHEMA)
    schemaUrl = url.toString()
    pg = new Client({ connectionString: databaseUrl })
    await pg.connect()
    await pg.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`)
    await pg.query(`CREATE SCHEMA ${SCHEMA}`)
    execFileSync(path.join(ROOT, "node_modules", ".bin", "prisma"), ["migrate", "deploy"], {
      cwd: ROOT,
      env: { ...process.env, DATABASE_URL: schemaUrl },
      stdio: "pipe",
    })
  }, 120_000)

  afterAll(async () => {
    process.env.DATABASE_URL = originalUrl
    await pg.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`)
    await pg.end()
  })

  it("migrates into the schema and queries it through createPrismaClient()", async () => {
    // Imported here so lib/prisma.ts's default client also sees a DATABASE_URL
    process.env.DATABASE_URL = schemaUrl
    const { createPrismaClient } = await import("@/lib/prisma")
    const db = createPrismaClient()
    try {
      await db.config.create({ data: { id: ROW, llmDisabled: true } })
      expect(await db.config.findUnique({ where: { id: ROW }, select: { llmDisabled: true } })).toEqual({ llmDisabled: true })
    } finally {
      await db.$disconnect()
    }

    const inSchema = await pg.query(`SELECT id FROM ${SCHEMA}."Config" WHERE id = $1`, [ROW])
    expect(inSchema.rowCount).toBe(1)
    const migrations = await pg.query(`SELECT count(*)::int AS n FROM ${SCHEMA}."_prisma_migrations"`)
    expect(migrations.rows[0].n).toBeGreaterThan(0)

    // public's tables (the shared test database has them) never see the row
    const inPublic = await pg.query(`SELECT to_regclass('public."Config"') IS NOT NULL AS has_table`)
    if (inPublic.rows[0].has_table) {
      expect((await pg.query(`SELECT id FROM public."Config" WHERE id = $1`, [ROW])).rowCount).toBe(0)
    }
  })
})
