/**
 * The titles a stored v3 Rewind names by rating key (P7.7): each page's
 * registry `share.titleKeys` over its own data, with the title the facts
 * print for it. Hiding a title checks its key is here, and copies the title
 * for the member's unhide list.
 *
 * @module lib/rewind/rating-keys
 */

import { registry, type RegistryEntry } from "@/lib/rewind/registry"
import type { RewindDataV3 } from "@/lib/wrapped/data/schema-v3"
import type { FactId } from "@/lib/wrapped/facts/catalogue"

/**
 * Every rating key the issue's pages name, mapped to its title. A page whose
 * data fails its schema names nothing.
 */
export function ratingKeysIn(rewind: Pick<RewindDataV3, "pages" | "facts">): Map<string, string> {
  const keys = new Map<string, string>()
  for (const page of rewind.pages) {
    if (page.type === "short-list") continue
    const entry: RegistryEntry = registry[page.type]
    const parsed = entry.schema.safeParse(page.data)
    if (!parsed.success || !entry.share.titleKeys) continue
    for (const [id, key] of Object.entries(entry.share.titleKeys(parsed.data)) as [FactId, string][]) {
      const title = rewind.facts[id]?.display
      if (title && !keys.has(key)) keys.set(key, title)
    }
  }
  return keys
}
