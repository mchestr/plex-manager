/**
 * @jest-environment node
 */

/** keysHash (TS 10.3, E28): the shared vector, order independence and an empty list. Server-only, so a Node test. */

import { createHash } from "node:crypto"

import { KEYS_HASH_VECTOR } from "@/lib/cleanup/__tests__/helpers/builders"
import { keysHash } from "@/lib/cleanup/keys-hash"

describe("keysHash", () => {
  it("gives the shared test vector", () => {
    expect(keysHash(KEYS_HASH_VECTOR.keys)).toBe(KEYS_HASH_VECTOR.hash)
    expect(KEYS_HASH_VECTOR.hash).toBe(createHash("sha256").update("movie:tmdb:1\nmovie:tmdb:2").digest("hex"))
  })

  it("does not depend on the key order, and does not change the list", () => {
    const keys = ["season:tvdb:9:4", "movie:tmdb:1", "show:tvdb:9"]
    const copy = [...keys]
    expect(keysHash(keys)).toBe(keysHash([...keys].reverse()))
    expect(keysHash(keys)).toBe(keysHash(["show:tvdb:9", "season:tvdb:9:4", "movie:tmdb:1"]))
    expect(keys).toEqual(copy)
  })

  it("hashes an empty list as the empty string", () => {
    expect(keysHash([])).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855")
  })

  it("gives lower-case hex of 64 characters, and another hash for another set", () => {
    expect(keysHash(["movie:tmdb:1"])).toMatch(/^[a-f0-9]{64}$/)
    expect(keysHash(["movie:tmdb:1"])).not.toBe(keysHash(["movie:tmdb:1", "movie:tmdb:2"]))
    expect(keysHash(["movie:tmdb:1|movie.delete|true"])).not.toBe(keysHash(["movie:tmdb:1|movie.delete|false"]))
  })
})
