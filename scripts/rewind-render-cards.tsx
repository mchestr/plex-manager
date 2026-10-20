#!/usr/bin/env tsx
/**
 * Renders share cards from `CardInput` JSON through the installed `next/og`
 * and prints one JSON line: each card's size in bytes and sha256 (P5.10).
 *
 *   tsx --conditions=react-server scripts/rewind-render-cards.tsx <inputs.json>
 *
 * The owner-versus-link render test uses it, because Jest cannot load
 * `@vercel/og`'s WASM; it is also a quick way to look at a card's PNG
 * (`--out <dir>` writes them).
 */

import { createHash } from "node:crypto"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { parseArgs } from "node:util"

import { renderCardPng } from "@/lib/rewind/cards/render"
import type { CardInput } from "@/lib/wrapped/data/share-safe"

async function main() {
  const { positionals, values } = parseArgs({ allowPositionals: true, options: { out: { type: "string" } } })
  const inputs = JSON.parse(readFileSync(positionals[0], "utf8")) as CardInput[]
  const results = []
  for (const [i, input] of inputs.entries()) {
    const png = await renderCardPng(input)
    if (!png) throw new Error(`No card for ${input.page.type}`)
    if (values.out) {
      mkdirSync(values.out, { recursive: true })
      writeFileSync(path.join(values.out, `${i}-${input.page.type}.png`), png)
    }
    results.push({ page: input.page.type, bytes: png.length, sha256: createHash("sha256").update(png).digest("hex") })
  }
  process.stdout.write(`${JSON.stringify(results)}\n`)
}

main().catch((error: unknown) => {
  process.stderr.write(`${String(error)}\n`)
  process.exit(1)
})
