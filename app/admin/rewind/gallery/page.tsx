import type { Metadata, Route } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { z } from "zod"

import { GalleryRun } from "@/components/admin/rewind/gallery/gallery-run"
import { GallerySheet } from "@/components/admin/rewind/gallery/gallery-sheet"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/ui/page-header"
import { getAdminGate } from "@/lib/admin"
import { selectedReplay } from "@/lib/llm/replay"
import { prisma } from "@/lib/prisma"
import { eligibleCards } from "@/lib/rewind/cards/eligible"
import { previewIdSchema, REPLAY_SELECTED } from "@/lib/rewind/dry-run/input"
import { readDryRun } from "@/lib/rewind/dry-run/store"
import { REVIEW_FIXTURE_IDS, REVIEW_FIXTURES, REVIEW_YEAR, type GalleryCopy, type GalleryView, type ReviewFixtureId } from "@/lib/rewind/gallery/review"
import { registry } from "@/lib/rewind/registry"
import { validatePagesOnRead } from "@/lib/rewind/select-pages"
import { cn } from "@/lib/utils"

export const dynamic = "force-dynamic"

export const metadata: Metadata = { title: "Gallery", robots: { index: false } }

const querySchema = z.object({
  fixture: z.enum(REVIEW_FIXTURE_IDS).catch("heavy"),
  copy: z.enum(["selected", "templates"]).optional().catch(undefined),
  view: z.enum(["phone", "spread"]).catch("phone"),
  preview: previewIdSchema.optional().catch(undefined),
})

const DisabledPagesSchema = z.array(z.string()).catch([])

type Query = { fixture: ReviewFixtureId; copy: GalleryCopy; view: GalleryView; preview?: string }

function galleryHref({ preview, ...query }: Query): Route {
  return `/admin/rewind/gallery?${new URLSearchParams(preview ? { ...query, preview } : query).toString()}` as Route
}

function ChoiceLink({ href, current, children, testId }: { href: Route; current: boolean; children: string; testId: string }) {
  return (
    <Button
      variant={current ? "secondary" : "ghost"}
      size="sm"
      nativeButton={false}
      render={<Link href={href} />}
      aria-current={current ? "page" : undefined}
      data-testid={testId}
      className={cn(current && "font-semibold")}
    >
      {children}
    </Button>
  )
}

/**
 * `/admin/rewind/gallery` (P7.11, design 10.3): one tab per review fixture,
 * each a dry run of the real pipeline (P7.10) shown through the real routes,
 * every page as the story settled on it and every card from the preview card
 * route. Copy replays the selected model's recordings, or "Templates only"
 * until the bake-off names a model.
 */
export default async function RewindGalleryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const gate = await getAdminGate()
  if (!gate.ok) notFound()

  const raw = querySchema.parse(await searchParams)
  const replay = selectedReplay()
  const wanted: GalleryCopy = raw.copy ?? (replay ? "selected" : "templates")
  const copy: GalleryCopy = wanted === "selected" && !replay ? "templates" : wanted
  const query: Query = { fixture: raw.fixture, copy, view: raw.view }

  const stored = raw.preview ? await readDryRun(raw.preview).catch(() => null) : null
  const run =
    stored?.status === "completed" && stored.subject.kind === "fixture" && stored.subject.fixtureId === query.fixture ? stored : null

  let sheet = null
  if (run && raw.preview) {
    const config = await prisma.config.findUnique({ where: { id: "config" }, select: { rewindDisabledPages: true } })
    const pages = validatePagesOnRead(run.data.pages, {
      archetype: run.data.archetype?.id ?? null,
      disabledPages: DisabledPagesSchema.parse(config?.rewindDisabledPages ?? []),
    })
    sheet = (
      <GallerySheet
        previewId={raw.preview}
        fixture={query.fixture}
        pages={pages.map((page) => ({ type: page.type, folio: page.folio, name: registry[page.type].name }))}
        cards={eligibleCards({ pages }, { dailyDetail: true })}
        view={query.view}
      />
    )
  }

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        title="Gallery"
        description="Every page and card of the five review fixtures, from a dry run through the real routes."
        data-testid="admin-rewind-gallery-header"
      />
      <nav aria-label="Review fixtures" className="flex flex-wrap gap-1">
        {REVIEW_FIXTURES.map((fixture) => (
          <ChoiceLink
            key={fixture.id}
            href={galleryHref({ ...query, fixture: fixture.id })}
            current={fixture.id === query.fixture}
            testId={`rewind-gallery-tab-${fixture.id}`}
          >
            {fixture.label}
          </ChoiceLink>
        ))}
      </nav>
      <div className="flex flex-wrap items-center gap-4">
        <nav aria-label="Copy" className="flex gap-1">
          {replay && (
            <ChoiceLink href={galleryHref({ ...query, copy: "selected" })} current={copy === "selected"} testId="rewind-gallery-copy-selected">
              Selected model
            </ChoiceLink>
          )}
          <ChoiceLink href={galleryHref({ ...query, copy: "templates" })} current={copy === "templates"} testId="rewind-gallery-copy-templates">
            Templates only
          </ChoiceLink>
        </nav>
        <nav aria-label="Frame size" className="flex gap-1">
          <ChoiceLink href={galleryHref({ ...query, view: "phone", preview: run ? raw.preview : undefined })} current={query.view === "phone"} testId="rewind-gallery-view-phone">
            Phone
          </ChoiceLink>
          <ChoiceLink href={galleryHref({ ...query, view: "spread", preview: run ? raw.preview : undefined })} current={query.view === "spread"} testId="rewind-gallery-view-spread">
            Desktop spread
          </ChoiceLink>
        </nav>
      </div>
      {!replay && (
        <p className="text-ui text-muted-foreground" data-testid="rewind-gallery-no-selection">
          No model has been selected yet, so the copy is templates only.
        </p>
      )}
      {sheet ?? (
        <GalleryRun
          key={`${query.fixture}:${copy}`}
          runKey={`${query.fixture}:${copy}`}
          input={{
            subject: { kind: "fixture", fixtureId: query.fixture },
            year: REVIEW_YEAR,
            ...(copy === "selected" ? { model: REPLAY_SELECTED } : { copyPolicy: "no-llm" }),
          }}
        />
      )}
    </div>
  )
}
