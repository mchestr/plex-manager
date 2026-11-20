/**
 * The title facts that an exclusion copies (TS 10.3 `excludeCleanupItems`
 * step 1): from the item row, else from the newest library data. Server-only.
 *
 * An item row holds no external ids, so its ids come from its title key
 * (`tmdb:753342`). A snapshot item gives every id it has.
 *
 * @module lib/cleanup/actions/items/titles
 */

import "server-only"

import type { ProtectionTitle } from "@/lib/cleanup/protections"
import type { SnapshotItem } from "@/lib/cleanup/schema/snapshot"
import { loadSnapshotLevel } from "@/lib/cleanup/snapshot/cache"
import type { CleanupItem } from "@/lib/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { LEVELS, type Level } from "@/lib/validations/cleanup-vocabulary"

type ExternalIds = NonNullable<ProtectionTitle["externalIds"]>

/** The id that a title key names: `tmdb:1` gives `{ tmdb: 1 }`. Null for `rk:` keys and anything else. @internal */
export function idsOfTitleKey(titleKey: string): ExternalIds | null {
  const [kind, value = ""] = titleKey.split(":", 2)
  if (kind === "imdb" && value) return { imdb: value }
  if (!/^\d+$/.test(value)) return null
  if (kind === "tmdb") return { tmdb: Number(value) }
  return kind === "tvdb" ? { tvdb: Number(value) } : null
}

const levelOf = (value: string): Level | null => LEVELS.find((level) => level === value) ?? null

function fromRow(row: CleanupItem, level: Level): ProtectionTitle {
  const { itemKey, titleKey, title, year, seasonNumber, sectionId, ratingKey } = row
  return { itemKey, level, titleKey, title, year, seasonNumber, sectionId, ratingKey, externalIds: idsOfTitleKey(titleKey) }
}

function fromSnapshot(item: SnapshotItem): ProtectionTitle {
  const { tmdb, tvdb, imdb } = item.ids
  const ids: ExternalIds = { ...(tmdb !== undefined ? { tmdb } : {}), ...(tvdb !== undefined ? { tvdb } : {}), ...(imdb !== undefined ? { imdb } : {}) }
  return {
    itemKey: item.key, level: item.level, titleKey: item.titleKey, title: item.title, year: item.year, seasonNumber: item.seasonNumber,
    sectionId: item.sectionId, ratingKey: item.ratingKey, externalIds: Object.keys(ids).length > 0 ? ids : null,
  }
}

/** The title of each key that an item row or the newest library data knows. A key that neither knows is left out. */
export async function readTitles(keys: readonly string[]): Promise<Map<string, ProtectionTitle>> {
  const titles = new Map<string, ProtectionTitle>()
  const rows = await prisma.cleanupItem.findMany({ where: { itemKey: { in: [...keys] } } })
  for (const row of rows) {
    const level = levelOf(row.level)
    if (level) titles.set(row.itemKey, fromRow(row, level))
  }
  const missing = keys.filter((key) => !titles.has(key))
  for (const level of LEVELS) {
    const wanted = missing.filter((key) => key.startsWith(`${level}:`))
    if (wanted.length === 0) continue
    const data = await loadSnapshotLevel(level)
    for (const key of wanted) {
      const item = data?.byKey.get(key)
      if (item) titles.set(key, fromSnapshot(item))
    }
  }
  return titles
}
