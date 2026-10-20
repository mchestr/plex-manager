import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { StoryStage } from "@/components/rewind/stage/story-stage"
import { getEnv } from "@/lib/env"
import { issuePages, type IssuePageType } from "@/lib/rewind/registry"
import { ARCHETYPES, type ArchetypeId } from "@/lib/wrapped/archetypes/catalogue"

import { DevScope } from "./dev-scope"
import { GuessIsland } from "./guess-island"

export const metadata: Metadata = {
  title: "Story player",
  robots: { index: false, follow: false },
}

function placeholder(type: IssuePageType, name: string, index: number, count: number) {
  return (
    <div className="flex h-full flex-col justify-between p-[calc(var(--u)*16px)] font-display" data-testid={`dev-rewind-page-${type}`}>
      <h2 className="text-display font-black">{name}</h2>
      {type === "guess" ? <GuessIsland /> : null}
      <p className="font-text text-lead">
        Page {index + 1} of {count}. The page body arrives with P5.5 to P5.7.
      </p>
    </div>
  )
}

/**
 * Drives P5.2's story player with placeholder pages until P5.1 mounts it in
 * `/rewind/[year]`. `?archetype=<id>` picks the colourway and `?edition=full`
 * shows all 18 pages instead of the ten core ones. Off unless
 * `ENABLE_DEV_UI=1`, like `/dev/ui`.
 */
export default async function DevRewindStagePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (getEnv().ENABLE_DEV_UI !== "1") notFound()

  const params = await searchParams
  const archetype = ARCHETYPES.find((a) => a.id === params.archetype)?.id ?? ("midnight-marathoner" satisfies ArchetypeId)
  const selected = issuePages.filter((p) => params.edition === "full" || p.core)
  const pages = selected.map((p, i) => ({ type: p.type, content: placeholder(p.type, p.name, i, selected.length) }))

  return (
    <DevScope archetype={archetype}>
      <StoryStage pages={pages} archetype={archetype} closeHref="/dev/ui" />
    </DevScope>
  )
}
