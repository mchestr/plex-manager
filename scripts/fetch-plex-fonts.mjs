#!/usr/bin/env node
/**
 * Copies the IBM Plex web fonts that `app/fonts.ts` loads into `app/_fonts/`
 * (P3.2), unmodified, from IBM's own npm releases.
 *
 *     node scripts/fetch-plex-fonts.mjs [--sources DIR]
 *
 * `scripts/plex-fonts.lock.json` pins each release tarball by URL and sha256,
 * and names the file each output is copied from. The script refuses a tarball
 * whose hash differs, writes the outputs, and records their sha256 in the
 * lock, which `scripts/__tests__/plex-fonts.test.ts` checks the committed
 * files against. `--sources DIR` reads already-downloaded tarballs (named as
 * in their URLs) instead of the registry. Neither CI nor Docker runs it.
 *
 * The files are IBM's WOFF2 builds as released, so they keep the reserved
 * name "Plex" (SIL OFL 1.1): any subset or conversion would be a Modified
 * Version and need a new family name, as `scripts/build-og-fonts.py` does.
 */

import { createHash } from "node:crypto"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { gunzipSync } from "node:zlib"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const LOCK = path.join(ROOT, "scripts/plex-fonts.lock.json")

const sha256 = (data) => createHash("sha256").update(data).digest("hex")

/** The files of a ustar archive, by path. */
function untar(buffer) {
  const files = new Map()
  for (let at = 0; at + 512 <= buffer.length; ) {
    const header = buffer.subarray(at, at + 512)
    if (header.every((byte) => byte === 0)) break
    const field = (start, length) => header.toString("latin1", start, start + length).replace(/\0.*$/s, "")
    const name = [field(345, 155), field(0, 100)].filter(Boolean).join("/")
    const size = parseInt(field(124, 12).trim() || "0", 8)
    const type = field(156, 1)
    if (type === "0" || type === "") files.set(name, buffer.subarray(at + 512, at + 512 + size))
    at += 512 + Math.ceil(size / 512) * 512
  }
  return files
}

async function readSource({ url, sha256: expected }, sourcesDir) {
  const data = sourcesDir
    ? readFileSync(path.join(sourcesDir, path.basename(new URL(url).pathname)))
    : Buffer.from(await (await fetch(url)).arrayBuffer())
  const actual = sha256(data)
  if (actual !== expected) throw new Error(`${url}: sha256 ${actual}, expected ${expected}`)
  return untar(gunzipSync(data))
}

const argv = process.argv.slice(2)
const sourcesIndex = argv.indexOf("--sources")
const sourcesDir = sourcesIndex === -1 ? undefined : path.resolve(argv[sourcesIndex + 1])

const lock = JSON.parse(readFileSync(LOCK, "utf8"))
const archives = {}
for (const [name, source] of Object.entries(lock.sources)) archives[name] = await readSource(source, sourcesDir)

for (const [output, entry] of Object.entries(lock.outputs)) {
  const data = archives[entry.source].get(entry.path)
  if (!data) throw new Error(`${entry.source} has no ${entry.path}`)
  mkdirSync(path.dirname(path.join(ROOT, output)), { recursive: true })
  writeFileSync(path.join(ROOT, output), data)
  entry.sha256 = sha256(data)
  console.log(`${output}  ${data.length} bytes`)
}
writeFileSync(LOCK, `${JSON.stringify(lock, null, 2)}\n`)
