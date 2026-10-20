/**
 * The card PNG cache on disk (design 6.4).
 *
 * A card is stored at `${REWIND_CACHE_DIR}/cards/{key}.png`, where the key is
 * `sha256(canonicalJson(cardInput) + CARD_VERSION)`. The input holds the
 * projected page and everything the projection depended on (flags, hidden
 * titles' version, signed, brand), so owner and link renders of the same
 * options share one file, and any change that alters the pixels changes the
 * key. Writes go to a temp file and are renamed into place, so a reader
 * never sees half a PNG. A read touches the file, and `sweepCards` deletes
 * files unused for 30 days.
 *
 * Authorisation always runs before a lookup: a file on disk is never proof
 * that a link may see it.
 *
 * @module lib/rewind/cards/cache
 */

import "server-only"

import { createHash, randomBytes } from "node:crypto"
import { mkdir, readdir, readFile, rename, rm, stat, utimes, writeFile } from "node:fs/promises"
import path from "node:path"

import { getEnv } from "@/lib/env"
import type { CardInput } from "@/lib/wrapped/data/share-safe"
import { canonicalJson } from "@/lib/wrapped/facts/hash"

import { CARD_VERSION } from "./version"

const DAY_MS = 86_400_000
/** Files unused this long are swept. @internal */
export const CARD_TTL_MS = 30 * DAY_MS

const cardsDir = () => path.join(getEnv().REWIND_CACHE_DIR, "cards")
const fileOf = (key: string) => path.join(cardsDir(), `${key}.png`)

/** The cache key of a card: 64 hex characters. */
export function cardCacheKey(input: CardInput, version: string = CARD_VERSION): string {
  return createHash("sha256").update(canonicalJson(input) + version).digest("hex")
}

/** The cached PNG, or null on a miss. A hit marks the file as used. */
export async function readCachedCard(key: string): Promise<Buffer | null> {
  try {
    const png = await readFile(fileOf(key))
    const now = new Date()
    await utimes(fileOf(key), now, now).catch(() => undefined)
    return png
  } catch {
    return null
  }
}

/** Stores a PNG atomically: a temp file in the same folder, then a rename. */
export async function writeCachedCard(key: string, png: Buffer): Promise<void> {
  await mkdir(cardsDir(), { recursive: true })
  const temp = path.join(cardsDir(), `.${key}.${randomBytes(6).toString("hex")}.tmp`)
  try {
    await writeFile(temp, png)
    await rename(temp, fileOf(key))
  } catch (error) {
    await rm(temp, { force: true })
    throw error
  }
}

/** Deletes cached cards (and stray temp files) unused for `CARD_TTL_MS`; returns how many. */
export async function sweepCards(now: number = Date.now()): Promise<number> {
  const names = await readdir(cardsDir()).catch(() => [] as string[])
  let removed = 0
  for (const name of names) {
    const file = path.join(cardsDir(), name)
    const info = await stat(file).catch(() => null)
    if (info?.isFile() && now - info.mtimeMs > CARD_TTL_MS) {
      await rm(file, { force: true })
      removed++
    }
  }
  return removed
}
