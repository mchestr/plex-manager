import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { z } from "zod"

import { CopyPane } from "@/components/admin/rewind/playground/copy-pane"
import { CostPane } from "@/components/admin/rewind/playground/cost-pane"
import { FactsPane } from "@/components/admin/rewind/playground/facts-pane"
import { Playground } from "@/components/admin/rewind/playground/playground"
import type { PlaygroundOptions } from "@/components/admin/rewind/playground/playground-form"
import { PreviewPane } from "@/components/admin/rewind/playground/preview-pane"
import { DEFAULT_MODEL, type PlaygroundForm } from "@/components/admin/rewind/playground/use-playground"
import { Alert } from "@/components/ui/alert"
import { PageHeader } from "@/components/ui/page-header"
import { getAdminGate } from "@/lib/admin"
import { listKnownModels } from "@/lib/llm/models"
import { isLLMProviderId } from "@/lib/llm/provider-presets"
import { selectedReplay } from "@/lib/llm/replay"
import { prisma } from "@/lib/prisma"
import { eligibleCards } from "@/lib/rewind/cards/eligible"
import { listDryRunFixtures, readDryRunFixture } from "@/lib/rewind/dry-run/fixtures"
import { DRY_RUN_EFFORTS, previewIdSchema } from "@/lib/rewind/dry-run/input"
import { previewOwnerId, readDryRun, type CompletedDryRun } from "@/lib/rewind/dry-run/store"
import { pagesForCut } from "@/lib/rewind/editions"
import { diffAgainstStored, playgroundView, type StoredDiff } from "@/lib/rewind/playground/view"
import { validatePagesOnRead } from "@/lib/rewind/select-pages"
import { recordIdSchema } from "@/lib/validations/params"
import { parseStoredRewind } from "@/lib/wrapped/data/parse-stored"
import { loadShareContext } from "@/lib/wrapped/data/share-context"
import { toShareSafe } from "@/lib/wrapped/data/share-safe"
import { SharePageTypeSchema, type SharePageType } from "@/lib/wrapped/data/share-safe-schema"
import { memberName } from "@/lib/wrapped/member-name"
import { PROMPT_VERSION } from "@/lib/wrapped/prompt/rewind-2026"
import { getSeasonYear } from "@/lib/wrapped/season"

export const metadata: Metadata = { title: "Playground", robots: { index: false } }

const querySchema = z.object({
  subject: recordIdSchema.optional().catch(undefined),
  fixture: z.string().optional().catch(undefined),
  preview: previewIdSchema.optional().catch(undefined),
})

const DisabledPagesSchema = z.array(z.string()).catch([])

/** The cards the run's printed pages project, as the share sheet lists them. */
async function previewCards(run: CompletedDryRun): Promise<string[]> {
  const [config, shareCtx] = await Promise.all([
    prisma.config.findUnique({ where: { id: "config" }, select: { rewindDisabledPages: true } }),
    loadShareContext({ userId: previewOwnerId(run.subject), year: run.data.year }),
  ])
  const numbering = { archetype: run.data.archetype?.id ?? null, disabledPages: DisabledPagesSchema.parse(config?.rewindDisabledPages ?? []) }
  const pages = validatePagesOnRead(pagesForCut(run.data, "full"), numbering)
  const pocket = run.data.edition === "full" ? validatePagesOnRead(pagesForCut(run.data, "pocket"), numbering) : []
  const printed = [...new Set([...pages, ...pocket].map((page) => page.type))].filter(
    (type): type is SharePageType => SharePageTypeSchema.safeParse(type).success
  )
  const shared = toShareSafe(run.data, { pages: printed, signed: false, includeArt: false, dailyDetail: true, cardFacts: [] }, shareCtx)
  return eligibleCards(shared, { dailyDetail: true })
}

/** The member's stored v3 Rewind against the run, or null when there is none to compare with. */
async function storedDiff(run: CompletedDryRun): Promise<StoredDiff | null> {
  if (run.subject.kind !== "member") return null
  const row = await prisma.plexWrapped.findUnique({
    where: { userId_year: { userId: run.subject.userId, year: run.data.year } },
    select: { data: true },
  })
  const stored = row ? parseStoredRewind(row.data) : null
  return stored?.version === 3 ? diffAgainstStored(run.data, stored.data) : null
}

async function loadOptions(): Promise<PlaygroundOptions> {
  const [users, provider, memberYear, fixtureIds] = await Promise.all([
    prisma.user.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.lLMProvider.findFirst({ where: { isActive: true, purpose: "wrapped" }, select: { provider: true, model: true } }),
    getSeasonYear(),
    listDryRunFixtures(),
  ])
  const fixtures = await Promise.all(
    fixtureIds.map(async (id) => ({ id, year: (await readDryRunFixture(id))?.window.year ?? memberYear }))
  )
  const active = provider && isLLMProviderId(provider.provider) && provider.model ? { provider: provider.provider, model: provider.model } : null
  return {
    members: users.map((user) => ({ id: user.id, name: memberName(user) ?? `Member ${user.id.slice(-6)}` })),
    fixtures,
    memberYear,
    provider: active,
    models: active && isLLMProviderId(active.provider) ? listKnownModels(active.provider).map((m) => ({ id: m.id, label: m.displayName })) : [],
    replay: selectedReplay() !== null,
    promptVersions: [PROMPT_VERSION],
    efforts: DRY_RUN_EFFORTS,
  }
}

/**
 * `/admin/rewind/playground` (P8.8, design 10.2): P7.10's dry runs of the
 * production pipeline (`generateUserRewind` in dry-run mode) on a member or
 * a golden fixture, with this run's model, prompt version, effort and copy
 * policy. A finished run (`?preview=<id>`) shows its facts, page selection,
 * raw output, grounding trail, cost and a story preview.
 * `/admin/playground` redirects here (`next.config.js`).
 */
export default async function RewindPlaygroundPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const gate = await getAdminGate()
  if (!gate.ok) notFound()

  const query = querySchema.parse(await searchParams)
  const options = await loadOptions()
  const fixtureId = options.fixtures.find((f) => f.id === query.fixture)?.id ?? options.fixtures.find((f) => f.id === "heavy")?.id ?? options.fixtures[0]?.id ?? ""
  const member = options.members.find((m) => m.id === query.subject)
  const initialForm: PlaygroundForm = {
    subject: member ? "member" : "fixture",
    fixtureId,
    userId: member?.id ?? options.members[0]?.id ?? "",
    model: DEFAULT_MODEL,
    promptVersion: PROMPT_VERSION,
    effort: "low",
    copyPolicy: options.provider ? "default" : "no-llm",
  }

  const stored = query.preview ? await readDryRun(query.preview).catch(() => null) : null
  let result = null
  if (query.preview && stored?.status === "completed") {
    const view = playgroundView(query.preview, stored)
    const [cards, diff] = await Promise.all([previewCards(stored), storedDiff(stored)])
    result = view ? (
      <div className="flex flex-col gap-10" data-testid="playground-result" data-preview-id={query.preview}>
        <FactsPane view={view} />
        <CopyPane view={view} />
        <CostPane usage={view.usage} diff={stored.subject.kind === "member" ? diff : undefined} />
        <PreviewPane previewId={view.previewId} year={view.year} cards={cards} />
      </div>
    ) : (
      <Alert tone="warning" title="This run's trail cannot be read" data-testid="playground-trail-unreadable">
        Run it again to see its panes.
      </Alert>
    )
  } else if (query.preview) {
    result = (
      <Alert tone="info" title="That run has expired" data-testid="playground-expired">
        A dry run is kept for an hour. Run it again.
      </Alert>
    )
  }

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        title="Playground"
        description="Dry runs of the real Rewind pipeline on a member or a golden fixture. Nothing is stored."
        data-testid="admin-rewind-playground-header"
      />
      <Playground initialForm={initialForm} options={options}>
        {result}
      </Playground>
    </div>
  )
}
