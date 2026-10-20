import type { Metadata, Route } from "next"
import { notFound, redirect } from "next/navigation"
import { getServerSession } from "next-auth"
import { z } from "zod"

import { ArticleDocument } from "@/components/rewind/article/article-document"
import { authOptions } from "@/lib/auth"
import { rewindName, serverName } from "@/lib/brand"
import { prisma } from "@/lib/prisma"
import { copyText, plain } from "@/lib/rewind/article/blocks"
import { articleSections } from "@/lib/rewind/article/sections"
import { volumeLine } from "@/lib/rewind/pages/facts"
import { safeReturnPath } from "@/lib/rewind/return-to"
import { pageMetrics } from "@/lib/rewind/typeset/metrics"
import { validatePagesOnRead } from "@/lib/rewind/select-pages"
import { loadRewindYearView } from "@/lib/rewind/year-view"
import { getAppSettings } from "@/lib/settings/app-settings"
import { yearParamSchema } from "@/lib/validations/params"
import { windowLine } from "@/lib/wrapped/copy/templates"

export const dynamic = "force-dynamic"

type ReadPageProps = {
  params: Promise<{ year: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

const DisabledPagesSchema = z.array(z.string()).catch([])

/**
 * With JavaScript off, `app/loading.tsx` leaves the streamed page in a hidden
 * `S:` segment behind its fallback. Show the segment and hide the fallback, so
 * the article reads without any script. The story's skeleton sits in
 * `[year]/(story)/`, so this route has no second boundary and the segment
 * holds the whole page in order. The rules sit in Tailwind's `base` layer:
 * its preflight hides `[hidden]` with a layered `!important`, which beats any
 * unlayered one.
 */
const NO_SCRIPT_STREAM =
  "@layer base{div[hidden][id^=S]{display:block!important}template[id^=B]+*{display:none!important}}"

/** "{server name} Rewind {year}, article", absolute: the root template would add the server name again. */
export async function generateMetadata({ params }: ReadPageProps): Promise<Metadata> {
  const parsed = yearParamSchema.safeParse((await params).year)
  const robots = { index: false }
  return parsed.success ? { title: { absolute: `${await rewindName(parsed.data)}, article` }, robots } : { robots }
}

/**
 * Article mode (P5.12, RWV-09, UI-09): the member's v3 issue as one semantic
 * document, with no client component on the page, for small screens, large
 * text, assistive technology and print. Years with no v3 issue go to the
 * story route, which shows their viewer or status panel.
 */
export default async function RewindArticlePage({ params, searchParams }: ReadPageProps) {
  const session = await getServerSession(authOptions)
  if (!session) redirect("/")

  const parsedYear = yearParamSchema.safeParse((await params).year)
  if (!parsedYear.success) notFound()
  const year = parsedYear.data
  const from = (await searchParams).from
  const returnTo = safeReturnPath(typeof from === "string" ? from : null)
  const storyHref = `/rewind/${year}${returnTo === "/" ? "" : `?from=${encodeURIComponent(returnTo)}`}` as Route

  const view = await loadRewindYearView({ userId: session.user.id, isAdmin: session.user.isAdmin }, year)
  if (view.kind !== "issue") redirect(storyHref)

  const { data } = view
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
    userId: session.user.id,
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
    <>
      <noscript>
        <style>{NO_SCRIPT_STREAM}</style>
      </noscript>
      <ArticleDocument
        title={`The ${data.year} issue`}
        masthead={[plain(volume ? `${brand}, ${volume}` : brand), copyText(windowLine(data.facts), data.facts)]}
        sections={sections}
        actions={
          <>
            <a href={storyHref} className="font-display font-semibold underline underline-offset-4" data-testid="rewind-article-story">
              Play the story
            </a>
            <a href={returnTo} className="font-display font-semibold underline underline-offset-4" data-testid="rewind-article-close">
              Close
            </a>
          </>
        }
      />
    </>
  )
}
