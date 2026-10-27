import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { RewindFigure } from "@/components/rewind/a11y/figure"
import { PageHeading } from "@/components/rewind/a11y/page-heading"
import { SrValue } from "@/components/rewind/a11y/sr-value"
import { StoryStage } from "@/components/rewind/stage/story-stage"
import { getEnv } from "@/lib/env"
import type { CopyAuthor } from "@/lib/rewind/copy-disclosure"
import { issuePages, type IssuePageType, type PageTable } from "@/lib/rewind/registry"
import { ARCHETYPES, type ArchetypeId } from "@/lib/wrapped/archetypes/catalogue"

import { DevScope } from "./dev-scope"
import { GuessIsland } from "./guess-island"

export const metadata: Metadata = {
  title: "Story player",
  robots: { index: false, follow: false },
}

const WORDS: Record<string, CopyAuthor> = {
  llm: { copySource: "llm", model: "anthropic:claude-sonnet-5-5" },
  local: { copySource: "llm", model: "openai-compatible:qwen3.6:27b" },
  template: { copySource: "template", model: null },
}

function placeholder(type: IssuePageType, name: string, index: number, count: number) {
  return (
    <div className="flex h-full flex-col justify-between p-[calc(var(--u)*16px)] font-display" data-testid={`dev-rewind-page-${type}`}>
      <PageHeading lines={[name]} className="text-display font-black" />
      {type === "guess" ? <GuessIsland /> : null}
      <RewindFigure summary={`A placeholder graphic for ${name}.`} className="h-[calc(var(--u)*120px)] border border-current">
        <SrValue value={`${(index + 1) * 100} hours`}>{(index + 1) * 100}</SrValue>
      </RewindFigure>
      <p className="font-text text-lead">
        Page {index + 1} of {count}. The page body arrives with P5.5 to P5.7.
      </p>
    </div>
  )
}

function placeholderTable(name: string): PageTable {
  return {
    caption: `${name} by month, 1 January to 30 November 2026.`,
    columns: ["Month", "Hours"],
    rows: [
      ["January", "42"],
      ["February", "38"],
      ["March", "51"],
    ],
  }
}

/**
 * Drives P5.2's story player with placeholder pages until P5.1 mounts it in
 * `/rewind/[year]`. `?archetype=<id>` picks the colourway, `?edition=full`
 * shows all 18 pages instead of the ten core ones, and `?words=llm|local|template`
 * picks the "About the words" line. Off unless `ENABLE_DEV_UI=1`, like `/dev/ui`.
 */
export default async function DevRewindStagePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (getEnv().ENABLE_DEV_UI !== "1") notFound()

  const params = await searchParams
  const archetype = ARCHETYPES.find((a) => a.id === params.archetype)?.id ?? ("midnight-marathoner" satisfies ArchetypeId)
  const words = WORDS[typeof params.words === "string" ? params.words : "llm"] ?? WORDS.llm
  const selected = issuePages.filter((p) => params.edition === "full" || p.core)
  const pages = selected.map((p, i) => ({
    type: p.type,
    content: placeholder(p.type, p.name, i, selected.length),
    table: p.table ? placeholderTable(p.name) : null,
  }))

  return (
    <DevScope archetype={archetype}>
      <StoryStage pages={pages} year={2026} archetype={archetype} closeHref="/dev/ui" copy={words} />
    </DevScope>
  )
}
