import type { IssueContext } from "@/components/rewind/pages/issue-context"
import { pageTone, type TonePair } from "@/lib/rewind/media/tone"
import type { IssuePageType } from "@/lib/rewind/registry"
import { ARCHETYPE_IDS, type ArchetypeId } from "@/lib/wrapped/archetypes/catalogue"

const isArchetype = (id: unknown): id is ArchetypeId => typeof id === "string" && (ARCHETYPE_IDS as readonly string[]).includes(id)

/** The duotone pair of one page of this issue: the field it prints in (after `altField`) and its spot. */
export function issueTone(issue: IssueContext, type: IssuePageType): TonePair {
  const field = issue.pages.find((page) => page.type === type)?.field ?? "paper"
  const archetype = issue.facts["archetype.id"]?.value
  return pageTone(field, isArchetype(archetype) ? archetype : null)
}
