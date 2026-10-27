/**
 * @jest-environment node
 */

/**
 * The postbuild step that drops the cached 200 from the prerendered pages
 * (`scripts/build/prerender-status.mjs`), so proxy.ts's 404s survive.
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

import { stripPrerenderStatus } from "../build/prerender-status.mjs"

let root: string

const write = (file: string, value: unknown) => {
  mkdirSync(path.dirname(file), { recursive: true })
  writeFileSync(file, JSON.stringify(value))
}
const read = (file: string) => JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), "prerender-status-"))
})

afterEach(() => rmSync(root, { recursive: true, force: true }))

describe("stripPrerenderStatus", () => {
  it("drops a 200 from every shell in every app folder and keeps the rest of each", () => {
    const server = path.join(root, "server/app")
    const standalone = path.join(root, "standalone/server/app")
    for (const dir of [server, standalone]) {
      write(path.join(dir, "rewind/s/[token].meta"), { status: 200, headers: { a: "b" }, postponed: "x" })
    }
    write(path.join(server, "membership.meta"), { status: 200 })

    const changed = stripPrerenderStatus([server, standalone])

    expect(changed.sort()).toEqual(
      [
        path.join(server, "membership.meta"),
        path.join(server, "rewind/s/[token].meta"),
        path.join(standalone, "rewind/s/[token].meta"),
      ].sort()
    )
    expect(read(path.join(server, "rewind/s/[token].meta"))).toEqual({ headers: { a: "b" }, postponed: "x" })
    expect(read(path.join(standalone, "rewind/s/[token].meta"))).toEqual({ headers: { a: "b" }, postponed: "x" })
    expect(read(path.join(server, "membership.meta"))).toEqual({})
  })

  it("keeps any other status, ignores other files and skips a missing folder", () => {
    const server = path.join(root, "server/app")
    write(path.join(server, "_not-found.meta"), { status: 404 })
    write(path.join(server, "rewind.meta"), { headers: {} })
    write(path.join(server, "rewind.html.json"), { status: 200 })

    expect(stripPrerenderStatus([server, path.join(root, "missing")])).toEqual([])
    expect(read(path.join(server, "_not-found.meta"))).toEqual({ status: 404 })
    expect(read(path.join(server, "rewind.html.json"))).toEqual({ status: 200 })
  })
})
