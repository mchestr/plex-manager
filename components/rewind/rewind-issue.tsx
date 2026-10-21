import "server-only"

import type { Route } from "next"
import { z } from "zod"

import { disableRewindShare, enableRewindShare, rotateRewindShare, saveRewindSharePrefs } from "@/actions/rewind-sharing"
import { PageBody } from "@/components/rewind/pages/page-body"
import type { IssueContext } from "@/components/rewind/pages/issue-context"
import { StoryStage } from "@/components/rewind/stage/story-stage"
import { serverName } from "@/lib/brand"
import { prisma } from "@/lib/prisma"
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
  /** Preview only (P7.11): open on this page, and with `still`, hold it settled. */
  initialPage?: string
  still?: boolean
}

/**
 * A stored v3 issue as the story (P5.5): its pages parsed with their
 * registry schemas, minus `Config.rewindDisabledPages`, numbered, typeset on
 * the server and handed to P5.2's `StoryStage` as slots, with the share
 * sheet's setup (P5.11).
 */
export async function RewindIssue({ rewindId, data, userId, returnTo, initialSheet, preview = false, initialPage, still = false }: RewindIssueProps) {
  const [settings, brand, config] = await Promise.all([
    getAppSettings(),
    serverName(),
    prisma.config.findUnique({ where: { id: "config" }, select: { rewindDisabledPages: true } }),
  ])
  const archetype = data.archetype?.id ?? null
  const pages = validatePagesOnRead(data.pages, { archetype, disabledPages: DisabledPagesSchema.parse(config?.rewindDisabledPages ?? []) })
  const share = preview ? null : await loadShareSetup({ userId, rewindId, year: data.year, pages })
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
      initialSheet={initialSheet}
      mode={preview ? "preview" : "member"}
      initialIndex={preview ? Math.max(0, pages.findIndex((page) => page.type === initialPage)) : undefined}
      still={preview && still}
    />
  )
}
