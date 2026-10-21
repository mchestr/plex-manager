import "server-only"

import type { Route } from "next"
import { z } from "zod"

import { hideRewindTitle, unhideRewindTitle } from "@/actions/rewind-exclusions"
import { disableRewindShare, enableRewindShare, rotateRewindShare, saveRewindSharePrefs } from "@/actions/rewind-sharing"
import { RegenerationWatch } from "@/components/rewind/hide/regeneration-watch"
import { PageBody } from "@/components/rewind/pages/page-body"
import type { IssueContext } from "@/components/rewind/pages/issue-context"
import { StoryStage } from "@/components/rewind/stage/story-stage"
import { serverName } from "@/lib/brand"
import { prisma } from "@/lib/prisma"
import { loadItemLinks } from "@/lib/rewind/item-links"
import { registry, type RegistryEntry } from "@/lib/rewind/registry"
import { validatePagesOnRead } from "@/lib/rewind/select-pages"
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

/**
 * A stored v3 issue as the story (P5.5): its pages parsed with their
 * registry schemas, minus `Config.rewindDisabledPages`, numbered, typeset on
 * the server and handed to P5.2's `StoryStage` as slots, with the share
 * sheet's setup (P5.11).
 */
export async function RewindIssue({ rewindId, data, userId, returnTo, initialSheet, preview = false }: RewindIssueProps) {
  const [settings, brand, config] = await Promise.all([
    getAppSettings(),
    serverName(),
    prisma.config.findUnique({ where: { id: "config" }, select: { rewindDisabledPages: true } }),
  ])
  const archetype = data.archetype?.id ?? null
  const pages = validatePagesOnRead(data.pages, { archetype, disabledPages: DisabledPagesSchema.parse(config?.rewindDisabledPages ?? []) })
  const [share, hidden, links] = await Promise.all([
    preview ? null : loadShareSetup({ userId, rewindId, rewind: data, pages }),
    preview
      ? null
      : prisma.rewindExclusion.findMany({ where: { userId }, select: { ratingKey: true, kind: true, title: true }, orderBy: { createdAt: "asc" } }),
    pages.some((page) => page.type === "next-year") ? loadItemLinks() : undefined,
  ])
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
    links,
  }

  return (
    <StoryStage
      pages={pages.map((page) => {
        const entry: RegistryEntry = registry[page.type]
        return {
          type: page.type,
          content: <PageBody page={page} issue={issue} />,
          table: entry.table?.(page.data, data.facts, { locale: settings.locale }) ?? null,
        }
      })}
      year={data.year}
      archetype={archetype}
      closeHref={returnTo}
      copy={{ copySource: data.copySource, model: data.copyMeta.model }}
      share={share ? { setup: share, actions: { enable: enableRewindShare, rotate: rotateRewindShare, disable: disableRewindShare, savePrefs: saveRewindSharePrefs } } : undefined}
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
      mode={preview ? "preview" : "member"}
    />
  )
}
