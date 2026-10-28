"use client"

import { type ReactNode, useState, useTransition } from "react"

import { updateRewindSettings } from "@/actions/admin/rewind-settings"
import {
  AUDIENCES,
  CheckboxField,
  CheckboxList,
  LLM_MODES,
  MonthDayField,
  SelectField,
  TimeZoneNote,
} from "@/components/admin/settings/rewind-settings/fields"
import { RewindSettingsStatusLine, type RewindSettingsStatus } from "@/components/admin/settings/rewind-settings/status-line"
import { RewindSettingsSummary } from "@/components/admin/settings/rewind-settings/summary"
import { FormField } from "@/components/ui/form-field"
import { Input } from "@/components/ui/input"
import { SettingsSection } from "@/components/ui/settings-section"
import { useToast } from "@/components/ui/toast"
import { useFormat } from "@/lib/format-context"
import type { SectionHealth } from "@/lib/settings/connection-status"
import { enableEntry, isFeatureEntry, REWIND_FEATURES } from "@/lib/rewind/features"
import { REWIND_CUT_PAGES, REWIND_DISABLED_PAGE_ENTRIES, rewindBudgetSchema, type RewindSettings } from "@/lib/validations/rewind-settings"

interface RewindSettingsSectionProps {
  /** The stored settings, from `rewindSettingsFromConfig`. */
  saved: RewindSettings
  /** The server zone the season dates are evaluated in. */
  zone: string
  /** `Config.llmDisabled`: Rewind then writes template copy whatever the mode. */
  llmDisabled: boolean
  /** Whether the Discord bot runs, so DMs can be sent. */
  discordBotOn: boolean
  /** The season's LLM spend so far, formatted. */
  spent: string
  /** Tautulli's libraries, or null when it is not configured or did not answer. */
  libraries: { id: string; name: string }[] | null
  /** The distinct content ratings in the metadata cache. */
  ratings: string[]
  status: RewindSettingsStatus
  /** The section's health: Redis, then Tautulli (`getSettingsHealth()`). */
  health: SectionHealth
  /** "Last saved ... by ..." from the audit log (P10.20). */
  footerMeta?: ReactNode
  /** The season console note, after the summary or the fields in both modes. */
  children?: ReactNode
}

type Draft = Omit<RewindSettings, "rewindLlmBudgetUsd"> & { rewindLlmBudgetUsd: string }

const toDraft = (saved: RewindSettings): Draft => ({ ...saved, rewindLlmBudgetUsd: String(saved.rewindLlmBudgetUsd) })

/** A `rewindDisabledPages` draft in its stored order, so a change undone reads as no change. */
const storedOrder = (entries: readonly string[]) => REWIND_DISABLED_PAGE_ENTRIES.filter((entry) => entries.includes(entry))

const NEXT_GENERATION = "Applies at the next generation."

/** Options for the stored entries the lists no longer offer, so they can still be cleared. */
function withStored(options: { value: string; label: string }[], stored: readonly string[], label: (value: string) => string) {
  const known = new Set(options.map((option) => option.value))
  return [...options, ...stored.filter((value) => !known.has(value)).map((value) => ({ value, label: label(value) }))]
}

/**
 * The Rewind section of the admin settings (P7.12, design 10.4 and 13.2):
 * every admin-facing Rewind flag, saved together with `updateRewindSettings`.
 * It opens on the saved settings ({@link RewindSettingsSummary}); Edit swaps
 * in the form, whose flags are checkboxes because they save with Save. The
 * Redis and Tautulli status line and the season console note show in both
 * modes. A budget the schema refuses or a season that opens and closes on
 * the same day holds Save with the reason; Cancel puts the stored values back.
 */
export function RewindSettingsSection({ saved, zone, llmDisabled, discordBotOn, spent, libraries, ratings, status, health, footerMeta, children }: RewindSettingsSectionProps) {
  const { showError, showSuccess } = useToast()
  const f = useFormat()
  const [isPending, startTransition] = useTransition()
  const [draft, setDraft] = useState(() => toDraft(saved))

  // Follow the stored values after a save refreshes the page
  const [prevSaved, setPrevSaved] = useState(saved)
  if (JSON.stringify(prevSaved) !== JSON.stringify(saved)) {
    setPrevSaved(saved)
    setDraft(toDraft(saved))
  }

  const set = <K extends keyof Draft>(key: K) => (value: Draft[K]) => setDraft((prev) => ({ ...prev, [key]: value }))

  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(saved))
  const budget = rewindBudgetSchema.safeParse(draft.rewindLlmBudgetUsd.trim() === "" ? Number.NaN : Number(draft.rewindLlmBudgetUsd))
  const budgetError = budget.success ? undefined : budget.error.issues[0]?.message
  const datesError = draft.rewindSeasonOpens === draft.rewindSeasonCloses ? "The season cannot open and close on the same day" : undefined

  // Resolves true once the write succeeded, so the section returns to its summary
  const save = () =>
    new Promise<boolean>((resolve) => {
      if (!budget.success || datesError) {
        resolve(false)
        return
      }
      const values = { ...draft, rewindLlmBudgetUsd: budget.data }
      startTransition(async () => {
        const result = await updateRewindSettings(values)
        if (result.success) {
          showSuccess("Rewind settings saved")
        } else {
          showError(result.error)
        }
        resolve(result.success)
      })
    })

  const libraryOptions = withStored(
    (libraries ?? []).map((library) => ({ value: library.id, label: library.name })),
    saved.rewindExcludedSectionIds,
    (id) => `Library ${id}`
  )
  const ratingOptions = withStored(
    ratings.map((rating) => ({ value: rating, label: rating })),
    saved.rewindExcludedContentRatings,
    (rating) => rating
  )

  return (
    <SettingsSection
      id="rewind"
      title="Rewind"
      description="Changes apply at once, except where a field says otherwise."
      status={health.status}
      checkedAt={health.checkedAt}
      footerMeta={footerMeta}
      form={{
        isDirty: dirty,
        isPending,
        onDiscard: () => setDraft(toDraft(saved)),
        onSave: save,
        blockedReason: budgetError || datesError ? "Fix the marked fields to save." : undefined,
      }}
      live={<RewindSettingsStatusLine status={status} />}
      view={
        <RewindSettingsSummary
          saved={saved}
          zone={zone}
          llmDisabled={llmDisabled}
          discordBotOn={discordBotOn}
          budget={f.money(saved.rewindLlmBudgetUsd, "prose")}
          spent={spent}
          libraries={libraries}
        />
      }
      after={children}
    >
      <div className="flex flex-col gap-8">
        <div className="grid grid-cols-1 items-start gap-6 md:grid-cols-2">
          <CheckboxField
            name="enabled"
            label="Rewind"
            description="Shows /rewind and the home page card to the audience below."
            checked={draft.rewindEnabled}
            onChange={set("rewindEnabled")}
          />
          <SelectField
            name="audience"
            label="Audience"
            description="Use Admins only to test. Change to Everyone when the season opens."
            items={AUDIENCES}
            value={draft.rewindAudience}
            onChange={(value) => set("rewindAudience")(value === "all" ? "all" : "admins")}
          />
        </div>

        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-1 items-start gap-6 md:grid-cols-2">
            <MonthDayField name="opens" label="Season opens" value={draft.rewindSeasonOpens} onChange={set("rewindSeasonOpens")} />
            <MonthDayField
              name="closes"
              label="Season closes"
              value={draft.rewindSeasonCloses}
              onChange={set("rewindSeasonCloses")}
              error={datesError}
            />
          </div>
          <TimeZoneNote zone={zone} />
        </div>

        <div className="grid grid-cols-1 items-start gap-6 md:grid-cols-2">
          <SelectField
            name="llm-mode"
            label="LLM mode"
            description={llmDisabled ? "AI features are off. Rewind uses template text." : "Off uses templates for all text."}
            items={LLM_MODES}
            value={draft.rewindLlmMode}
            onChange={(value) => set("rewindLlmMode")(value === "economy" || value === "off" ? value : "standard")}
            disabled={llmDisabled}
          />
          <FormField
            name="budget"
            label="Season budget (USD)"
            description={`Spent this season: ${spent}. When spend reaches the budget, Rewind uses template text.`}
            error={budgetError}
          >
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              max={1000}
              step={0.01}
              value={draft.rewindLlmBudgetUsd}
              onValueChange={set("rewindLlmBudgetUsd")}
              data-testid="rewind-settings-budget"
            />
          </FormField>
        </div>

        <div className="grid grid-cols-1 items-start gap-6 md:grid-cols-2">
          <CheckboxField
            name="public-links"
            label="Public links"
            description="While this is off, members cannot make links and old links do not open. Turn it on again to restore old links."
            checked={draft.rewindPublicLinks}
            onChange={set("rewindPublicLinks")}
          />
          <CheckboxField
            name="public-counts"
            label="Public counts"
            description="Show counts instead of percentages on public cards."
            checked={draft.rewindPublicCounts}
            onChange={set("rewindPublicCounts")}
          />
          <CheckboxField
            name="server-name"
            label="Server name on cards"
            description="Uses the name from the Plex server settings."
            checked={draft.rewindShowServerNameOnCards}
            onChange={set("rewindShowServerNameOnCards")}
          />
          <CheckboxField
            name="artwork"
            label="Artwork on cards"
            description="Members can add posters to their cards."
            checked={draft.rewindAllowArtOnCards}
            onChange={set("rewindAllowArtOnCards")}
          />
          <CheckboxField
            name="managed"
            label="Include managed accounts"
            description={`Plex Home managed accounts get a Rewind too. ${NEXT_GENERATION}`}
            checked={draft.rewindIncludeManagedUsers}
            onChange={set("rewindIncludeManagedUsers")}
          />
        </div>

        <CheckboxList
          name="libraries"
          legend="Excluded libraries"
          description={NEXT_GENERATION}
          options={libraryOptions}
          selected={draft.rewindExcludedSectionIds}
          onChange={set("rewindExcludedSectionIds")}
          empty={libraries ? "Tautulli has no libraries." : "Could not get the libraries from Tautulli."}
        />
        <CheckboxList
          name="ratings"
          legend="Excluded content ratings"
          description={NEXT_GENERATION}
          options={ratingOptions}
          selected={draft.rewindExcludedContentRatings}
          onChange={set("rewindExcludedContentRatings")}
          empty="No content ratings yet. They show after you prepare the season data."
        />
        <CheckboxList
          name="pages"
          legend="Disabled pages"
          description="In cut-list order. The 10 core pages always show."
          options={REWIND_CUT_PAGES.map((page) => ({ value: page.key, label: page.label }))}
          selected={draft.rewindDisabledPages}
          onChange={(pages) => set("rewindDisabledPages")(storedOrder([...pages, ...draft.rewindDisabledPages.filter(isFeatureEntry)]))}
        />
        {/* The December features (P8.3, P8.4) share the list: a checkbox writes or removes its `+key` entry. */}
        <CheckboxList
          name="features"
          legend="Features added in December"
          description="Each feature is off until you turn it on here. First test it on the heavy test member. Then record the change in ship-check.md."
          options={REWIND_FEATURES.map((feature) => ({ value: enableEntry(feature.key), label: feature.label }))}
          selected={draft.rewindDisabledPages}
          onChange={(features) => set("rewindDisabledPages")(storedOrder([...draft.rewindDisabledPages.filter((entry) => !entry.startsWith("+")), ...features]))}
        />
        <CheckboxList
          name="channels"
          legend="Ready notifications"
          options={[
            {
              value: "discord",
              label: "Discord DM",
              disabled: !discordBotOn,
              note: discordBotOn ? undefined : "The Discord bot is off. Turn it on to send DMs.",
            },
            { value: "banner", label: "Dashboard banner" },
          ]}
          selected={draft.rewindNotifyChannels}
          onChange={(channels) => set("rewindNotifyChannels")(channels as Draft["rewindNotifyChannels"])}
        />
      </div>
    </SettingsSection>
  )
}
