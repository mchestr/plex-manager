"use client"

import { useRouter } from "next/navigation"
import { useEffect, useRef } from "react"

import { startCleanupFirstRead } from "@/actions/admin/cleanup-settings"
import { OffAlert } from "@/components/admin/cleanup/page/page-alerts"
import { SourceLine } from "@/components/admin/cleanup/page/source-line"
import { CleanupSteps } from "@/components/admin/cleanup/rules/cleanup-steps"
import { LibraryTiles } from "@/components/admin/cleanup/rules/library-tiles"
import { RecipeGallery } from "@/components/admin/cleanup/rules/recipe-gallery"
import type { CleanupOverviewData } from "@/lib/cleanup/types/screens"

/** While the first library read runs, the page reads its data again this often, so the counts show when it ends. @internal */
export const FIRST_READ_REFRESH_MS = 20_000

/** No complete library read yet. */
export const hasNoLibraryData = (snapshot: CleanupOverviewData["snapshot"]): boolean => !snapshot.takenAt && !snapshot.finishedAt

/**
 * Starts the first library read once per mount, while no library data exists
 * and the job queue is set up (TS 7.10). The action does nothing when a read
 * already runs or waits. The page render never starts one. While the read
 * runs, the page refreshes its data, so the recipe counts show when it ends.
 */
function useFirstRead(waiting: boolean) {
  const router = useRouter()
  const asked = useRef(false)

  useEffect(() => {
    if (!waiting || asked.current) return
    asked.current = true
    // A refusal only means that a read already runs or waits: the refresh below shows its result
    void startCleanupFirstRead().catch(() => undefined)
  }, [waiting])

  useEffect(() => {
    if (!waiting) return
    const timer = setInterval(() => router.refresh(), FIRST_READ_REFRESH_MS)
    return () => clearInterval(timer)
  }, [waiting, router])
}

/**
 * The Rules tab on first use, before any rule exists (UX 4.1.1,
 * `shots/01-rules-first-use.png`): the off alert while the feature is off,
 * the three steps, the library tiles, "Start with a recipe" with the source
 * line, and the recipe gallery with the blank card. The page header shows
 * no action then: this tab is the way in.
 */
export function FirstUse({ data, now }: { data: CleanupOverviewData; now: number }) {
  const { feature, snapshot } = data
  useFirstRead(feature.redis && hasNoLibraryData(snapshot))
  return (
    <div className="flex flex-col gap-6">
      {!feature.enabled && <OffAlert />}
      <CleanupSteps />
      <LibraryTiles library={data.library} />
      <section aria-labelledby="admin-cleanup-recipes-heading" className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 id="admin-cleanup-recipes-heading" className="text-h2 text-foreground">
            Start with a recipe
          </h2>
          <p className="text-ui text-muted-foreground">Each recipe makes a normal rule that you can change. Counts are for this server today.</p>
        </div>
        <SourceLine sources={data.sources} snapshot={snapshot} redis={feature.redis} now={now} />
        <RecipeGallery recipes={data.recipes} graceDays={data.defaults.graceDays} now={now} />
      </section>
    </div>
  )
}
