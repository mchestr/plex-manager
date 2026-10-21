/**
 * @jest-environment node
 */
import { createHash } from "node:crypto"

import { sha256Hex } from "@/lib/utils/sha256"

describe("sha256Hex", () => {
  it("matches node:crypto on empty, short, block-boundary, multi-block and non-ASCII input", () => {
    const inputs = ["", "abc", "user-1:archetype.tagline", "a".repeat(55), "a".repeat(56), "a".repeat(64), "b".repeat(1000), "Ke$ha · Amélie 🎬 東京"]
    for (const text of inputs) expect(sha256Hex(text)).toBe(createHash("sha256").update(text).digest("hex"))
  })

  it("gives the known vector for abc", () => {
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
  })
})
