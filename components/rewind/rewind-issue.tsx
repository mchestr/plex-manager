import "server-only"

import type { Route } from "next"
import { z } from "zod"

import { hideRewindTitle, unhideRewindTitle } from "@/actions/rewind-exclusions"
import { disableRewindShare, enableRewindShare, rotateRewindShare, saveRewindSharePrefs, updateRewindShare } from "@/actions/rewind-sharing"
import { recordRewindView } from "@/actions/rewind-views"
import { RegenerationWatch } from "@/components/rewind/hide/regeneration-watch"
import { PageBody } from "@/components/rewind/pages/page-body"
import type { IssueContext } from "@/components/rewind/pages/issue-context"
import { StoryStage } from "@/components/rewind/stage/story-stage"
import { serverName } from "@/lib/brand"
import { prisma } from "@/lib/prisma"
import { pagesForCut } from "@/lib/rewind/editions"
import { rewindFeatureFlags } from "@/lib/rewind/features"
import { loadItemLinks } from "@/lib/rewind/item-links"
import { answeredNotes, pageNotes, type CoreNotesContext } from "@/lib/rewind/notes"
import { registry, type RegistryEntry } from "@/lib/rewind/registry"
import { validatePagesOnRead, type SelectedPage } from "@/lib/rewind/select-pages"
import { loadShareSetup } from "@/lib/rewind/share-setup"
import type { SheetName } from "@/lib/rewind/stage/player-reducer"
import { getAppSettings } from "@/lib/settings/app-settings"
import type { RewindDataV3 } from "@/lib/wrapped/data/schema-v3"

const DisabledPagesSchema = z.array(z.string()).catch([])

interface RewindIssueProps {
  /** The `PlexWrapped` row id: the owner card route's address. */
  rewindId: string
  data: RewindDataV3
  userId: string
  returnTo: Route
  /** `?sheet=share` opens the share sheet over the cover. */
  initialSheet?: SheetName
  /** An admin's dry run (P7.10): no share setup, and the stage runs in preview mode. */
  preview?: boolean
  /** Preview only (P7.11): open on this page, and with `still`, hold it settled. */
  initialPage?: string
  still?: boolean
  /** A member's stored Rewind in the admin shell (P7.9): no share setup, and the stage runs framed in admin-preview mode. */
  adminPreview?: boolean
  /** Where the stage's "Read as an article" goes, when not the member's own article. */
  articleHref?: Route
}

/** "Browse the library" on the postcard: the server's own Plex web app when it has a public URL. */
async function libraryHref(): Promise<string | undefined> {
  const server = await prisma.plexServer.findFirst({ where: { isActive: true }, orderBy: { updatedAt: "desc" }, select: { publicUrl: true } })
  return server?.publicUrl ? `${server.publicUrl.replace(/\/+$/, "")}/web/index.html` : undefined
}

/** The member's completed Rewinds before `year`, newest first, for the bookends' Notes (P8.4). */
async function earlierYears(userId: string, year: number): Promise<number[]> {
  const rows = await prisma.plexWrapped.findMany({ where: { userId, year: { lt: year }, status: "completed" }, select: { year: true }, orderBy: { year: "desc" } })
  return rows.map((row) => row.year)
}

/**
 * A stored v3 issue as the story (P5.5): its pages parsed with their
 * registry schemas, minus `Config.rewindDisabledPages`, numbered, typeset on
 * the server and handed to P5.2's `StoryStage` as slots, with the share
 * sheet's setup (P5.11). A full issue also typesets its pocket cut
 * (`pagesForCut`, P7.3), numbered 1 to 6, which the cover can swap to.
 * The December feature flags (P8.3) are read here and passed down as booleans.
 */
export async function RewindIssue({
  rewindId,
  data,
  userId,
  returnTo,
  initialSheet,
  preview = false,
  adminPreview = false,
  articleHref,
  initialPage,
  still = false,
}: RewindIssueProps) {
  const mode = adminPreview ? "admin-preview" : preview ? "preview" : "member"
  const [settings, brand, config] = await Promise.all([
    getAppSettings(),
    serverName(),
    prisma.config.findUnique({ where: { id: "config" }, select: { rewindDisabledPages: true } }),
  ])
  const archetype = data.archetype?.id ?? null
  const features = rewindFeatureFlags(config)
  const numbering = { archetype, disabledPages: DisabledPagesSchema.parse(config?.rewindDisabledPages ?? []) }
  const pages = validatePagesOnRead(pagesForCut(data, "full"), numbering)
  const pocket = data.edition === "full" ? validatePagesOnRead(pagesForCut(data, "pocket"), numbering) : null
  const [share, hidden, links, library, earlier] = await Promise.all([
    mode !== "member" ? null : loadShareSetup({ userId, rewindId, rewind: data, pages, features }),
    mode !== "member"
      ? null
      : prisma.rewindExclusion.findMany({ where: { userId }, select: { ratingKey: true, kind: true, title: true }, orderBy: { createdAt: "asc" } }),
    pages.some((page) => page.type === "next-year") ? loadItemLinks() : undefined,
    data.edition === "postcard" ? libraryHref() : undefined,
    features["notes.core"] && pages.some((page) => page.type === "bookends") ? earlierYears(userId, data.year) : [],
  ])
  const types = (list: readonly SelectedPage[]) => list.map((page) => page.type)
  const hiddenKeys = new Set((hidden ?? []).map((row) => row.ratingKey))
  const issue: IssueContext = {
    year: data.year,
    userId,
    locale: settings.locale,
    serverName: brand,
    edition: data.edition,
    pages,
    copy: data.copy,
    copySource: data.copySource,
    model: data.copyMeta.model,
    returnTo,
    facts: data.facts,
    cuts: { full: data.edition === "full" ? types(pages) : null, pocket: types(pocket ?? pages) },
    libraryHref: library,
    links,
    features,
  }
  const slots = (list: readonly SelectedPage[], context: IssueContext) => {
    const notesCtx: CoreNotesContext = {
      locale: settings.locale,
      hiddenKeys,
      features,
      coreNotes: features["notes.core"],
      pages: list.map((page) => ({ folio: page.folio, name: registry[page.type].name, type: page.type })),
      earlierYears: earlier,
      serverName: brand,
      copySource: data.copySource,
      cards: share?.cards.map((card) => registry[card].name),
    }
    return list.map((page) => {
      const entry: RegistryEntry = registry[page.type]
      return {
        type: page.type,
        content: <PageBody page={page} issue={context} />,
        table: entry.table?.(page.data, data.facts, { locale: settings.locale }) ?? null,
        notes: pageNotes(page, data.facts, notesCtx),
        notesAnswered: answeredNotes(page, data.facts, notesCtx),
      }
    })
  }

  return (
    <StoryStage
      pages={slots(pages, issue)}
      pocket={pocket ? slots(pocket, { ...issue, pages: pocket }) : undefined}
      year={data.year}
      serverName={brand}
      archetype={archetype}
      closeHref={returnTo}
      copy={{ copySource: data.copySource, model: data.copyMeta.model }}
      share={share ? { setup: share, actions: { enable: enableRewindShare, rotate: rotateRewindShare, disable: disableRewindShare, savePrefs: saveRewindSharePrefs, update: updateRewindShare } } : undefined}
      hide={
        hidden
          ? {
              hidden: hidden.map((row) => ({ ratingKey: row.ratingKey, kind: row.kind === "film" ? "film" : "series", title: row.title })),
              actions: { hide: hideRewindTitle, unhide: unhideRewindTitle },
              watch: <RegenerationWatch year={data.year} />,
            }
          : undefined
      }
      initialSheet={initialSheet}
      mode={mode}
      articleHref={articleHref}
      views={mode === "member" ? { rewindId, record: recordRewindView } : undefined}
      initialIndex={mode === "preview" ? Math.max(0, pages.findIndex((page) => page.type === initialPage)) : undefined}
      still={mode === "preview" && still}
      tapCompletes={features["stage.tap-completes"]}
    />
  )
}
