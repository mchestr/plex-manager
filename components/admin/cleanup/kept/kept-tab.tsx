"use client"

import { useRef } from "react"

import { KeptTable } from "@/components/admin/cleanup/kept/kept-table"
import { KeptTiles } from "@/components/admin/cleanup/kept/kept-tiles"
import type { CleanupProtectionsData } from "@/lib/cleanup/types/screens"

/**
 * The Kept and excluded tab of Media cleanup (UX 4.8, `shots/08`): the four
 * tiles, then every member Keep and admin exclusion that protects now, with
 * search, Kind and the row actions. The heading takes focus after a row
 * leaves the list (`tabIndex={-1}`).
 */
export function KeptTab({ data }: { data: CleanupProtectionsData }) {
  const heading = useRef<HTMLHeadingElement>(null)
  const all = data.tiles.keeps.count + data.tiles.excludes.count
  return (
    <div className="flex flex-col gap-8">
      <KeptTiles tiles={data.tiles} />
      <section aria-labelledby="admin-cleanup-kept-heading" className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 ref={heading} id="admin-cleanup-kept-heading" tabIndex={-1} className="text-h2 text-foreground outline-none">
            Kept and excluded titles
          </h2>
          <p className="text-ui text-muted-foreground">
            Every rule skips these titles until the protection ends. A Keep or an exclusion that ends does not delete anything: the title can join
            Leaving soon again, with a full grace period.
          </p>
        </div>
        <KeptTable data={data} all={all} successFocus={heading} />
      </section>
    </div>
  )
}
