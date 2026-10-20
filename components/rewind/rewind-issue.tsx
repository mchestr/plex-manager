import "server-only"

import type { Route } from "next"
import { z } from "zod"

import { PageBody } from "@/components/rewind/pages/page-body"
import type { IssueContext } from "@/components/rewind/pages/issue-context"
import { StoryStage } from "@/components/rewind/stage/story-stage"
import { serverName } from "@/lib/brand"
import { prisma } from "@/lib/prisma"
import { validatePagesOnRead } from "@/lib/rewind/select-pages"
import { getAppSettings } from "@/lib/settings/app-settings"
import type { RewindDataV3 } from "@/lib/wrapped/data/schema-v3"

const DisabledPagesSchema = z.array(z.string()).catch([])

/**
 * A stored v3 issue as the story (P5.5): its pages parsed with their
 * registry schemas, minus `Config.rewindDisabledPages`, numbered, typeset on
 * the server and handed to P5.2's `StoryStage` as slots.
 */
export async function RewindIssue({ data, userId, returnTo }: { data: RewindDataV3; userId: string; returnTo: Route }) {
  const [settings, brand, config] = await Promise.all([
    getAppSettings(),
    serverName(),
    prisma.config.findUnique({ where: { id: "config" }, select: { rewindDisabledPages: true } }),
  ])
  const archetype = data.archetype?.id ?? null
  const pages = validatePagesOnRead(data.pages, { archetype, disabledPages: DisabledPagesSchema.parse(config?.rewindDisabledPages ?? []) })
  const issue: IssueContext = {
    year: data.year,
    userId,
    locale: settings.locale,
    serverName: brand,
    edition: data.edition,
    pages,
    copy: data.copy,
    copySource: data.copySource,
    zone: data.window.zone === settings.timeZone ? "server" : "member",
    facts: data.facts,
  }

  return (
    <StoryStage
      pages={pages.map((page) => ({ type: page.type, content: <PageBody page={page} issue={issue} /> }))}
      archetype={archetype}
      closeHref={returnTo}
    />
  )
}
