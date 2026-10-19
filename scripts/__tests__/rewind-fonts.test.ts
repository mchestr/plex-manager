/**
 * @jest-environment node
 *
 * The committed Rewind fonts and metrics are exactly what
 * scripts/build-rewind-fonts.py wrote from the pinned sources (P2.13).
 */
import { createHash } from "node:crypto"
import { existsSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import { brotliDecompressSync } from "node:zlib"

const ROOT = path.resolve(__dirname, "../..")
const lock = JSON.parse(readFileSync(path.join(ROOT, "scripts/rewind-fonts.lock.json"), "utf8")) as {
  source: { commit: string; files: Record<string, { path: string; sha256: string }> }
  outputs: Record<string, string>
}
const WEB = "app/(app)/rewind/_fonts"
const CARDS = "lib/rewind/cards/fonts"
const PRELOADED = ["archivo-vf.woff2", "newsreader-display-italic.woff2"]

const sha256 = (file: string) => createHash("sha256").update(readFileSync(path.join(ROOT, file))).digest("hex")
const size = (file: string) => statSync(path.join(ROOT, file)).size

/** Reads the `name` table out of a TTF, or out of a WOFF2's brotli stream. */
function sfntTable(buffer: Buffer, wanted: string): Buffer {
  if (buffer.toString("latin1", 0, 4) !== "wOF2") {
    const count = buffer.readUInt16BE(4)
    for (let i = 0; i < count; i++) {
      const at = 12 + i * 16
      if (buffer.toString("latin1", at, at + 4) === wanted) {
        return buffer.subarray(buffer.readUInt32BE(at + 8), buffer.readUInt32BE(at + 8) + buffer.readUInt32BE(at + 12))
      }
    }
    throw new Error(`no ${wanted} table`)
  }
  // WOFF2 (https://www.w3.org/TR/WOFF2/): a table directory, then one brotli stream.
  const KNOWN = ["cmap", "head", "hhea", "hmtx", "maxp", "name", "OS/2", "post", "cvt ", "fpgm", "glyf", "loca", "prep"]
  let at = 48
  const base128 = () => {
    let value = 0
    for (;;) {
      const byte = buffer[at++]
      value = value * 128 + (byte & 0x7f)
      if (!(byte & 0x80)) return value
    }
  }
  const tables: { tag: string; length: number }[] = []
  for (let i = 0; i < buffer.readUInt16BE(12); i++) {
    const flags = buffer[at++]
    const tag = (flags & 0x3f) === 0x3f ? buffer.toString("latin1", at, (at += 4)) : KNOWN[flags & 0x3f] ?? "????"
    const version = flags >> 6
    const original = base128()
    const transformed = tag === "glyf" || tag === "loca" ? version === 0 : version !== 0
    tables.push({ tag, length: transformed ? base128() : original })
  }
  const stream = brotliDecompressSync(buffer.subarray(at, at + buffer.readUInt32BE(20)))
  let offset = 0
  for (const table of tables) {
    if (table.tag === wanted) return stream.subarray(offset, offset + table.length)
    offset += table.length
  }
  throw new Error(`no ${wanted} table`)
}

function familyNames(file: string): string[] {
  const name = sfntTable(readFileSync(path.join(ROOT, file)), "name")
  const count = name.readUInt16BE(2)
  const strings = name.readUInt16BE(4)
  const names: string[] = []
  for (let i = 0; i < count; i++) {
    const at = 6 + i * 12
    const [platform, , , nameId, length, offset] = [0, 2, 4, 6, 8, 10].map((o) => name.readUInt16BE(at + o))
    if (platform !== 3 || (nameId !== 1 && nameId !== 16)) continue
    names.push(name.subarray(strings + offset, strings + offset + length).swap16().toString("utf16le"))
  }
  return names
}

describe("Rewind fonts", () => {
  const outputs = Object.keys(lock.outputs)
  const fonts = outputs.filter((f) => /\.(ttf|woff2)$/.test(f))

  it("pins every source to a google/fonts commit and a sha256", () => {
    expect(lock.source.commit).toMatch(/^[0-9a-f]{40}$/)
    for (const file of Object.values(lock.source.files)) expect(file.sha256).toMatch(/^[0-9a-f]{64}$/)
  })

  it("ships the four web fonts, the eleven card instances and the metrics", () => {
    expect(fonts.filter((f) => f.startsWith(WEB))).toHaveLength(4)
    expect(fonts.filter((f) => f.startsWith(CARDS))).toHaveLength(11)
    expect(outputs).toContain("lib/rewind/typeset/metrics.json")
  })

  it.each(Object.entries(lock.outputs))("%s matches the lockfile hash", (file, hash) => {
    expect(sha256(file)).toBe(hash)
  })

  it("stays inside the NFR-5 budget: 110 KB preloaded and 160 KB in all", () => {
    const web = fonts.filter((f) => f.startsWith(WEB))
    const preloaded = PRELOADED.reduce((sum, f) => sum + size(`${WEB}/${f}`), 0)
    const total = web.reduce((sum, f) => sum + size(f), 0)
    expect(preloaded).toBeLessThanOrEqual(110 * 1024)
    expect(total).toBeLessThanOrEqual(160 * 1024)
  })

  it.each([WEB, CARDS])("keeps the OFL licences beside the fonts in %s", (dir) => {
    for (const family of ["archivo", "newsreader"]) {
      const file = `${dir}/OFL-${family}.txt`
      expect(existsSync(path.join(ROOT, file))).toBe(true)
      expect(sha256(file)).toBe(lock.source.files[`ofl-${family}`].sha256)
      expect(readFileSync(path.join(ROOT, file), "utf8")).toContain("SIL OPEN FONT LICENSE Version 1.1")
    }
  })

  it.each(fonts)("renames the family of %s", (file) => {
    const names = familyNames(file)
    expect(names.length).toBeGreaterThan(0)
    for (const name of names) expect(name).toMatch(/^Rewind (Archivo|Newsreader)/)
  })
})
