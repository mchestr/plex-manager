"use client"

import { ProtectionImpact, useProtectionImpact } from "@/components/admin/cleanup/settings/protection-impact"
import { countWords } from "@/components/admin/cleanup/settings/protection-rows"
import {
  draftErrors,
  draftOf,
  type OptionId,
  onCount,
  type ProtectionsDraft,
  SETTINGS_ORDER,
  toProtections,
} from "@/components/admin/cleanup/settings/protections-draft"
import { ProtectionsFields } from "@/components/admin/cleanup/settings/protections-fields"
import { SectionState, useCleanupSettingsForm } from "@/components/admin/cleanup/settings/section-parts"
import { Badge } from "@/components/ui/badge"
import { SettingsSection } from "@/components/ui/settings-section"
import { SettingsSummary } from "@/components/ui/settings-summary"
import type { GlobalProtectionId } from "@/lib/cleanup/engine/types"
import { seasonalCollections, seasonalName } from "@/lib/cleanup/preview/protection-words"
import type { SettingsProtection } from "@/lib/cleanup/types/list-parts"
import type { CleanupSettingsData } from "@/lib/cleanup/types/screens"
import type { ProtectionsOptions } from "@/lib/validations/cleanup-options"

/** UX 8.8. */
const PROTECTIONS_WORDS = {
  title: "Global protections",
  description: "Every rule skips a title that any of these keeps safe. Each rule shows them, read only, under Never touch.",
} as const

const isOn = (options: ProtectionsOptions, id: GlobalProtectionId) => id === "g1" || id === "g3" || options[id].enabled

/** "Always on", "On" or "Off". */
const stateWord = (options: ProtectionsOptions, id: GlobalProtectionId) => (id === "g1" || id === "g3" ? "Always on" : isOn(options, id) ? "On" : "Off")

/** The line under the state: "Protects 23 titles", "Needs Sonarr", or the Kometa suggestion of an unused G13. */
function readSub(protection: SettingsProtection, options: ProtectionsOptions, suggestion: CleanupSettingsData["kometaSuggestion"]): string | null {
  const on = isOn(options, protection.id)
  if (protection.id === "g13" && !on && suggestion) return `Suggested: ${suggestion.names.map(seasonalName).join(", ")}`
  const words = countWords(protection, on, protection.protects)
  return words === "Off" ? null : words
}

/** The read view (UX 4.10, `shots/10-settings.png`): two columns of each protection, its state and "Protects N". The header shows "{N} on". */
function ProtectionsSummary({ data }: { data: CleanupSettingsData }) {
  const options = data.options.protections
  const byId = new Map(data.protections.map((p) => [p.id, p]))
  return (
    <div className="flex flex-col gap-4">
      <SettingsSummary className="gap-y-0 md:gap-y-0" data-testid="settings-cleanup-protections-summary">
        {SETTINGS_ORDER.flatMap((id) => {
          const protection = byId.get(id)
          if (!protection) return []
          const sub = readSub(protection, options, data.kometaSuggestion)
          return [
            <div key={id} className="flex items-start justify-between gap-4 border-t py-3" data-testid={`settings-cleanup-protections-summary-${id}`}>
              <dt className="min-w-0 text-ui text-foreground">{protection.sentence}</dt>
              <dd className="flex shrink-0 flex-col items-end text-right">
                <span className="text-label font-semibold text-foreground">{stateWord(options, id)}</span>
                {sub && <span className="text-caption text-muted-foreground">{sub}</span>}
              </dd>
            </div>,
          ]
        })}
      </SettingsSummary>
    </div>
  )
}

/** A G13 name that the draft adds and no library read has read: not saved and not one of Kometa's seasonal names (TS 5.3 rule 3). */
function hasUnreadCollection(draft: ProtectionsDraft, saved: ProtectionsOptions, options: readonly string[]): boolean {
  const read = new Set([...saved.g13.collections, ...seasonalCollections(options)])
  return draft.g13.enabled && draft.g13.collections.some((name) => !read.has(name))
}

/**
 * The Global protections section (UX 4.10, 5.4.1, 7.7 item 4): read first,
 * with "{N} on" and "Protects N" for each protection, then Edit with one
 * row each and the impact line in the footer. A save takes the titles that
 * a new protection keeps safe out of Leaving soon at once, or at the end of
 * the run in progress, which the toast then says (UX 8.9).
 */
export function ProtectionsSection({ data }: { data: CleanupSettingsData }) {
  const saved = data.options.protections
  const state = useCleanupSettingsForm<ProtectionsDraft>(draftOf(saved), (values) => {
    const protections = toProtections(values)
    return protections ? { input: { section: "cleanup-protections", values: { protections } } } : { errors: draftErrors(values) }
  })
  const draft = state.values
  const impact = useProtectionImpact(toProtections(draft), state.form.isDirty)
  const savedCounts = new Map(data.protections.map((p) => [p.id, p.protects]))
  const draftCounts = impact.current ? impact.settled?.result?.protects : undefined
  const protects = (id: GlobalProtectionId) => (draftCounts ? (draftCounts[id] ?? null) : (savedCounts.get(id) ?? null))
  const change = <K extends OptionId>(id: K, patch: Partial<ProtectionsDraft[K]>) =>
    state.set({ [id]: { ...draft[id], ...patch } } as Partial<ProtectionsDraft>)

  return (
    <SettingsSection
      id="cleanup-protections"
      title={PROTECTIONS_WORDS.title}
      description={PROTECTIONS_WORDS.description}
      form={state.form}
      badge={<SectionState badge={<Badge>{onCount(draftOf(saved))} on</Badge>} testId="settings-cleanup-protections-state" />}
      view={<ProtectionsSummary data={data} />}
      after={(editing) =>
        editing && <ProtectionImpact impact={impact} unreadCollections={hasUnreadCollection(draft, saved, data.collectionOptions)} />
      }
    >
      <ProtectionsFields
        data={data}
        draft={draft}
        saved={saved}
        change={change}
        replace={(next) => state.set({ g13: next.g13 })}
        protects={protects}
        errors={state.errors}
        disabled={state.form.isPending}
      />
    </SettingsSection>
  )
}
