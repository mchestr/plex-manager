/**
 * @jest-environment node
 */

import { spawnSync } from "node:child_process"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

// GAP-13: the script loads `.env` before anything touches Prisma, falls back
// to the database for the token, and `--dry-run` needs neither.

const ROOT = path.resolve(__dirname, "../..")
const TSX = path.join(ROOT, "node_modules/.bin/tsx")
const SCRIPT = path.join(ROOT, "scripts/register-discord-commands.ts")

let dir: string

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "register-discord-commands-"))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

/** Runs the script in the temp directory, with no Discord or database variables exported. */
function run(dotenv: string, ...args: string[]) {
  writeFileSync(path.join(dir, ".env"), dotenv)
  const env: NodeJS.ProcessEnv = { PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: "test" }
  return spawnSync(
    TSX,
    ["--conditions=react-server", "--tsconfig", path.join(ROOT, "tsconfig.scripts.json"), SCRIPT, ...args],
    { cwd: dir, env, encoding: "utf8", timeout: 60_000 }
  )
}

describe("scripts/register-discord-commands.ts", () => {
  it("--dry-run lists the commands and exits 0 without credentials", () => {
    const result = run("DISCORD_GUILD_ID=123\n", "--dry-run")

    expect(result.status).toBe(0)
    for (const name of ["help", "mark", "assistant", "mymarks", "mystats", "watching"]) {
      expect(result.stdout).toContain(`/${name}`)
    }
  }, 60_000)

  it("exits 1 with the message when no token is set and the database has none", () => {
    // DATABASE_URL comes only from .env, so reaching the database proves the
    // file was loaded first; nothing listens on port 1.
    const result = run("DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:1/none_test\n")

    expect(result.status).toBe(1)
    expect(result.stderr).toContain("Could not read the Discord settings from the database")
    expect(result.stderr).toContain("No Discord bot token: set DISCORD_BOT_TOKEN, or save the token in Admin, Discord.")
  }, 60_000)
})
