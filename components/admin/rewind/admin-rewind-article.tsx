import "server-only"

import { z } from "zod"

import { ArticleDocument } from "@/components/rewind/article/article-document"
import { serverName } from "@/lib/brand"
import { prisma } from "@/lib/prisma"
import { copyText, plain } from "@/lib/rewind/article/blocks"
import { articleSections } from "@/lib/rewind/article/sections"
import { volumeLine } from "@/lib/rewind/pages/facts"
import { validatePagesOnRead } from "@/lib/rewind/select-pages"
import { pageMetrics } from "@/lib/rewind/typeset/metrics"
import { getAppSettings } from "@/lib/settings/app-settings"
import type { RewindDataV3 } from "@/lib/wrapped/data/schema-v3"
import { windowLine } from "@/lib/wrapped/copy/templates"

const DisabledPagesSchema = z.array(z.string()).catch([])

/**
 * A member's v3 issue as article mode (P5.12) inside the admin preview
 * (P7.9): the sections the member's `/rewind/{year}/read` shows, with the
 * page header's toggle back to the story instead of the member's links.
 */
export async function AdminRewindArticle({ data, userId }: { data: RewindDataV3; userId: string }) {
  const [settings, brand, config] = await Promise.all([
    getAppSettings(),
    serverName(),
    prisma.config.findUnique({ where: { id: "config" }, select: { rewindDisabledPages: true } }),
  ])
  const pages = validatePagesOnRead(data.pages, {
    archetype: data.archetype?.id ?? null,
    disabledPages: DisabledPagesSchema.parse(config?.rewindDisabledPages ?? []),
  })
  const sections = articleSections(pages, data.facts, {
    year: data.year,
    userId,
    locale: settings.locale,
    serverName: brand,
    edition: data.edition,
    pages,
    copy: data.copy,
    copySource: data.copySource,
    model: data.copyMeta.model,
    zone: data.window.zone === settings.timeZone ? "server" : "member",
    metrics: pageMetrics,
  })
  const volume = volumeLine(data.facts)

  return (
    <ArticleDocument
      title={`The ${data.year} issue`}
      masthead={[plain(volume ? `${brand}, ${volume}` : brand), copyText(windowLine(data.facts), data.facts)]}
      sections={sections}
    />
  )
}
