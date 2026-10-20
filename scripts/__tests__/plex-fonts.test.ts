/**
 * @jest-environment node
 *
 * The committed IBM Plex web fonts are exactly the files that
 * scripts/fetch-plex-fonts.mjs copied from the pinned IBM releases (P3.2), and
 * app/fonts.ts loads every one of them.
 */
import { createHash } from "node:crypto"
import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"

const ROOT = path.resolve(__dirname, "../..")
const lock = JSON.parse(readFileSync(path.join(ROOT, "scripts/plex-fonts.lock.json"), "utf8")) as {
  sources: Record<string, { url: string; sha256: string }>
  outputs: Record<string, { source: string; path: string; sha256: string }>
}
const DIR = "app/_fonts"

const sha256 = (file: string) => createHash("sha256").update(readFileSync(path.join(ROOT, file))).digest("hex")

describe("IBM Plex web fonts", () => {
  it.each(Object.entries(lock.outputs))("%s matches the lock", (file, entry) => {
    expect(lock.sources).toHaveProperty(entry.source)
    expect(sha256(file)).toBe(entry.sha256)
  })

  it("pins every source to an IBM npm release by sha256", () => {
    for (const { url, sha256: hash } of Object.values(lock.sources)) {
      expect(url).toMatch(/^https:\/\/registry\.npmjs\.org\/@ibm\/plex-[a-z-]+\/-\/plex-[a-z-]+-\d+\.\d+\.\d+\.tgz$/)
      expect(hash).toMatch(/^[0-9a-f]{64}$/)
    }
  })

  it("keeps the licence beside the fonts and nothing unpinned", () => {
    const committed = readdirSync(path.join(ROOT, DIR)).map((name) => `${DIR}/${name}`)
    expect(committed.sort()).toEqual(Object.keys(lock.outputs).sort())
    expect(readFileSync(path.join(ROOT, DIR, "OFL.txt"), "utf8")).toContain('Reserved Font Name "Plex"')
  })

  it("loads every font file from app/fonts.ts", () => {
    const source = readFileSync(path.join(ROOT, "app/fonts.ts"), "utf8")
    const loaded = [...source.matchAll(/"\.\/(_fonts\/[^"]+\.woff2)"/g)].map((match) => `app/${match[1]}`)
    const fonts = Object.keys(lock.outputs).filter((file) => file.endsWith(".woff2"))
    expect(loaded.sort()).toEqual(fonts.sort())
  })
})
