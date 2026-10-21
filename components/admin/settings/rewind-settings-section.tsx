"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"

import { updateRewindSettings } from "@/actions/admin/rewind-settings"
import { CheckboxList, MonthDayField, SelectField, SwitchField } from "@/components/admin/settings/rewind-settings/fields"
import { RewindSettingsStatusLine, type RewindSettingsStatus } from "@/components/admin/settings/rewind-settings/status-line"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { FormField } from "@/components/ui/form-field"
import { Input } from "@/components/ui/input"
import { useToast } from "@/components/ui/toast"
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
}

type Draft = Omit<RewindSettings, "rewindLlmBudgetUsd"> & { rewindLlmBudgetUsd: string }

const toDraft = (saved: RewindSettings): Draft => ({ ...saved, rewindLlmBudgetUsd: String(saved.rewindLlmBudgetUsd) })

const AUDIENCES = [
  { value: "admins", label: "Admins only" },
  { value: "all", label: "Everyone" },
]

const LLM_MODES = [
  { value: "standard", label: "Standard" },
  { value: "economy", label: "Economy (the budget model)" },
  { value: "off", label: "Off (template copy)" },
]

/** A `rewindDisabledPages` draft in its stored order, so a change undone reads as no change. */
const storedOrder = (entries: readonly string[]) => REWIND_DISABLED_PAGE_ENTRIES.filter((entry) => entries.includes(entry))

const NEXT_GENERATION = "Takes effect at the next generation."

/** Options for the stored entries the lists no longer offer, so they can still be cleared. */
function withStored(options: { value: string; label: string }[], stored: readonly string[], label: (value: string) => string) {
  const known = new Set(options.map((option) => option.value))
  return [...options, ...stored.filter((value) => !known.has(value)).map((value) => ({ value, label: label(value) }))]
}

/**
 * The Rewind section of the admin settings (P7.12, design 10.4 and 13.2):
 * every admin-facing Rewind flag, saved together with `updateRewindSettings`.
 * Save stays disabled until something changed; Discard restores the stored values.
 */
export function RewindSettingsSection({ saved, zone, llmDisabled, discordBotOn, spent, libraries, ratings, status }: RewindSettingsSectionProps) {
  const router = useRouter()
  const { showError, showSuccess } = useToast()
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

  const save = () => {
    if (!budget.success) return
    startTransition(async () => {
      const result = await updateRewindSettings({ ...draft, rewindLlmBudgetUsd: budget.data })
      if (result.success) {
        showSuccess("Rewind settings saved")
        router.refresh()
      } else {
        showError(result.error)
      }
    })
  }

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
    <Card id="rewind" data-testid="rewind-settings-section">
      <CardHeader>
        <CardTitle as="h2">Rewind</CardTitle>
        <CardDescription>Who sees Rewind, when the season runs, and what each issue may include.</CardDescription>
        <RewindSettingsStatusLine status={status} />
      </CardHeader>

      <CardContent className="flex flex-col gap-8">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <SwitchField
            name="enabled"
            label="Rewind"
            description="Turns /rewind and the home card on for the audience below."
            checked={draft.rewindEnabled}
            onChange={set("rewindEnabled")}
          />
          <SelectField
            name="audience"
            label="Audience"
            description="Admins only for the soft launch, then Everyone when the season opens."
            items={AUDIENCES}
            value={draft.rewindAudience}
            onChange={(value) => set("rewindAudience")(value === "all" ? "all" : "admins")}
          />
        </div>

        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <MonthDayField name="opens" label="Season opens" value={draft.rewindSeasonOpens} onChange={set("rewindSeasonOpens")} />
            <MonthDayField
              name="closes"
              label="Season closes"
              value={draft.rewindSeasonCloses}
              onChange={set("rewindSeasonCloses")}
              error={datesError}
            />
          </div>
          <p className="text-label text-muted-foreground" data-testid="rewind-settings-zone">
            Dates are in {zone}. A season that crosses the new year belongs to the year it opens in.{" "}
            <Link href="#server-time-zone" className="text-foreground underline underline-offset-3">
              Change the server time zone
            </Link>
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <SelectField
            name="llm-mode"
            label="LLM mode"
            description={llmDisabled ? "AI features are off, so Rewind uses template copy." : "Off writes every line from templates."}
            items={LLM_MODES}
            value={draft.rewindLlmMode}
            onChange={(value) => set("rewindLlmMode")(value === "economy" || value === "off" ? value : "standard")}
            disabled={llmDisabled}
          />
          <FormField
            name="budget"
            label="Season budget (USD)"
            description={`Spent so far this season: ${spent}. Past the budget, issues get template copy.`}
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

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <SwitchField
            name="public-links"
            label="Public links"
            description="Off refuses new links, and existing links stop opening without being deleted. Turning it back on restores them."
            checked={draft.rewindPublicLinks}
            onChange={set("rewindPublicLinks")}
          />
          <SwitchField
            name="public-counts"
            label="Public counts"
            description="Show counts instead of percentages on public cards."
            checked={draft.rewindPublicCounts}
            onChange={set("rewindPublicCounts")}
          />
          <SwitchField
            name="server-name"
            label="Server name on cards"
            description="The name is the one set with the Plex server."
            checked={draft.rewindShowServerNameOnCards}
            onChange={set("rewindShowServerNameOnCards")}
          />
          <SwitchField
            name="artwork"
            label="Artwork on cards"
            description="Let members include posters on their cards."
            checked={draft.rewindAllowArtOnCards}
            onChange={set("rewindAllowArtOnCards")}
          />
          <SwitchField
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
          empty={libraries ? "Tautulli lists no libraries." : "Tautulli is not available, so its libraries cannot be listed."}
        />
        <CheckboxList
          name="ratings"
          legend="Excluded content ratings"
          description={NEXT_GENERATION}
          options={ratingOptions}
          selected={draft.rewindExcludedContentRatings}
          onChange={set("rewindExcludedContentRatings")}
          empty="No content ratings yet. They appear once the season data is prepared."
        />
        <CheckboxList
          name="pages"
          legend="Disabled pages"
          description="In cut-list order. The ten core pages are always included."
          options={REWIND_CUT_PAGES.map((page) => ({ value: page.key, label: page.label }))}
          selected={draft.rewindDisabledPages}
          onChange={(pages) => set("rewindDisabledPages")(storedOrder([...pages, ...draft.rewindDisabledPages.filter(isFeatureEntry)]))}
        />
        {/* The December features (P8.3, P8.4) share the list: a switch writes or removes its `+key` entry. */}
        <CheckboxList
          name="features"
          legend="Features added in December"
          description="Each is off until turned on here. Check it on the heavy test member first, and record the enable in ship-check.md."
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
              note: discordBotOn ? undefined : "The Discord bot is off, so no DMs can be sent.",
            },
            { value: "banner", label: "Dashboard banner" },
          ]}
          selected={draft.rewindNotifyChannels}
          onChange={(channels) => set("rewindNotifyChannels")(channels as Draft["rewindNotifyChannels"])}
        />
      </CardContent>

      <CardFooter className="justify-end">
        {dirty && (
          <span className="mr-auto text-label text-muted-foreground" data-testid="rewind-settings-unsaved">
            Unsaved changes
          </span>
        )}
        <Button variant="secondary" onClick={() => setDraft(toDraft(saved))} disabled={!dirty || isPending} data-testid="rewind-settings-discard">
          Discard
        </Button>
        <Button
          onClick={save}
          disabled={!dirty || isPending || Boolean(budgetError) || Boolean(datesError)}
          loading={isPending}
          data-testid="rewind-settings-save"
        >
          Save
        </Button>
      </CardFooter>
    </Card>
  )
}
