import "server-only"

import type { Route } from "next"
import { z } from "zod"

import { disableRewindShare, enableRewindShare, rotateRewindShare, saveRewindSharePrefs } from "@/actions/rewind-sharing"
import { PageBody } from "@/components/rewind/pages/page-body"
import type { IssueContext } from "@/components/rewind/pages/issue-context"
import { StoryStage } from "@/components/rewind/stage/story-stage"
import { serverName } from "@/lib/brand"
import { prisma } from "@/lib/prisma"
import { pagesForCut } from "@/lib/rewind/editions"
import { loadItemLinks } from "@/lib/rewind/item-links"
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
}

/** "Browse the library" on the postcard: the server's own Plex web app when it has a public URL. */
async function libraryHref(): Promise<string | undefined> {
  const server = await prisma.plexServer.findFirst({ where: { isActive: true }, select: { publicUrl: true } })
  return server?.publicUrl ? `${server.publicUrl.replace(/\/+$/, "")}/web/index.html` : undefined
}

/**
 * A stored v3 issue as the story (P5.5): its pages parsed with their
 * registry schemas, minus `Config.rewindDisabledPages`, numbered, typeset on
 * the server and handed to P5.2's `StoryStage` as slots, with the share
 * sheet's setup (P5.11). A full issue also typesets its pocket cut
 * (`pagesForCut`, P7.3), numbered 1 to 6, which the cover can swap to.
 */
export async function RewindIssue({ rewindId, data, userId, returnTo, initialSheet, preview = false }: RewindIssueProps) {
  const [settings, brand, config] = await Promise.all([
    getAppSettings(),
    serverName(),
    prisma.config.findUnique({ where: { id: "config" }, select: { rewindDisabledPages: true } }),
  ])
  const archetype = data.archetype?.id ?? null
  const numbering = { archetype, disabledPages: DisabledPagesSchema.parse(config?.rewindDisabledPages ?? []) }
  const pages = validatePagesOnRead(pagesForCut(data, "full"), numbering)
  const pocket = data.edition === "full" ? validatePagesOnRead(pagesForCut(data, "pocket"), numbering) : null
  const [share, links, library] = await Promise.all([
    preview ? null : loadShareSetup({ userId, rewindId, year: data.year, pages }),
    pages.some((page) => page.type === "next-year") ? loadItemLinks() : undefined,
    data.edition === "postcard" ? libraryHref() : undefined,
  ])
  const types = (list: readonly SelectedPage[]) => list.map((page) => page.type)
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
    zone: data.window.zone === settings.timeZone ? "server" : "member",
    facts: data.facts,
    cuts: { full: data.edition === "full" ? types(pages) : null, pocket: types(pocket ?? pages) },
    libraryHref: library,
    links,
  }
  const slots = (list: readonly SelectedPage[], context: IssueContext) =>
    list.map((page) => {
      const entry: RegistryEntry = registry[page.type]
      return {
        type: page.type,
        content: <PageBody page={page} issue={context} />,
        table: entry.table?.(page.data, data.facts, { locale: settings.locale }) ?? null,
      }
    })

  return (
    <StoryStage
      pages={slots(pages, issue)}
      pocket={pocket ? slots(pocket, { ...issue, pages: pocket }) : undefined}
      year={data.year}
      archetype={archetype}
      closeHref={returnTo}
      copy={{ copySource: data.copySource, model: data.copyMeta.model }}
      share={share ? { setup: share, actions: { enable: enableRewindShare, rotate: rotateRewindShare, disable: disableRewindShare, savePrefs: saveRewindSharePrefs } } : undefined}
      initialSheet={initialSheet}
      mode={preview ? "preview" : "member"}
    />
  )
}
