/**
 * @jest-environment node
 *
 * CARD_VERSION is generated from the installed next/og and the card fonts
 * (P2.14). Upgrading Next or rebuilding the fonts without running
 * `npm run rewind:card-version` fails here.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

import { CARD_RENDERER_VERSION, CARD_VERSION } from "@/lib/rewind/cards/version"

import { CARD_VERSION_PATTERN, computeCardVersion, satoriVersion } from "../../../../scripts/card-version/compute.mjs"

const ROOT = path.resolve(__dirname, "../../../..")

describe("CARD_VERSION", () => {
  it("equals the value recomputed from the installed packages and fonts", () => {
    expect(CARD_VERSION).toBe(computeCardVersion(ROOT))
  })

  it("has the fixed format and the renderer version", () => {
    expect(CARD_VERSION).toMatch(CARD_VERSION_PATTERN)
    expect(CARD_VERSION.startsWith(`rewind-cards@${CARD_RENDERER_VERSION}+`)).toBe(true)
  })

  it("fails loudly when the og bundle names no Satori version", () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "card-version-"))
    try {
      const og = path.join(root, "node_modules/next/dist/compiled/@vercel/og")
      mkdirSync(og, { recursive: true })
      writeFileSync(path.join(og, "index.node.js"), "export {}")
      expect(() => satoriVersion(root)).toThrow(/No satori@x\.y\.z/)
      writeFileSync(path.join(og, "index.node.js"), "satori@0.29.0 satori@0.30.1")
      expect(() => satoriVersion(root)).toThrow(/Conflicting Satori versions/)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
