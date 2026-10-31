import type { ReactNode } from "react"

import { AUDIENCES, LLM_MODES, monthDayLabel, TimeZoneNote } from "@/components/admin/settings/rewind-settings/fields"
import { NotSet, SettingsSummary, SettingsSummaryRow } from "@/components/ui/settings-summary"
import { REWIND_FEATURES, rewindFeatureOn } from "@/lib/rewind/features"
import { REWIND_CUT_PAGES, type RewindSettings } from "@/lib/validations/rewind-settings"

interface RewindSettingsSummaryProps {
  saved: RewindSettings
  /** The server zone the season dates are evaluated in. */
  zone: string
  /** `Config.llmDisabled`: Rewind then writes template copy whatever the mode. */
  llmDisabled: boolean
  /** Whether the Discord bot runs, so DMs can be sent. */
  discordBotOn: boolean
  /** The season budget, formatted. */
  budget: string
  /** The season's LLM spend so far, formatted. */
  spent: string
  /** Tautulli's libraries, or null when it is not configured or did not answer. */
  libraries: { id: string; name: string }[] | null
}

const row = (key: string) => `settings-rewind-summary-${key}`

const onOff = (value: boolean) => (value ? "On" : "Off")

const labelOf = (items: readonly { value: string; label: string }[], value: string) => items.find((item) => item.value === value)?.label ?? value

/** A short list as comma-separated text, or what an empty one reads as. */
const list = (values: readonly string[], empty: string) => (values.length > 0 ? values.join(", ") : <NotSet>{empty}</NotSet>)

/** A value with the reason the form gives beside its control, muted on the line below. */
function WithNote({ note, children }: { note?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <div>{children}</div>
      {note && <div className="text-label text-muted-foreground">{note}</div>}
    </div>
  )
}

/** One group of the summary: an `h3` in sentence case over its definition list. */
function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-ui font-medium text-foreground">{title}</h3>
      <SettingsSummary>{children}</SettingsSummary>
    </div>
  )
}

/**
 * The Rewind section's saved settings in view mode, grouped as the form is
 * (Availability, Season, AI text, Sharing, Content, Notifications), each
 * group an `h3` over a `SettingsSummary` (GOV.UK "Summary list").
 *
 * ## Decoding
 *
 * - Disabled pages and the December features share `rewindDisabledPages`:
 *   the pages are its cut-list keys, in cut-list order, and a feature is on
 *   by {@link rewindFeatureOn} (its `+key` stored and not its plain key).
 * - A stored library Tautulli no longer lists, or every library while it is
 *   unavailable, reads "Library <id>", as its checkbox does.
 *
 * ## Disabled controls
 *
 * Where the form disables a control and says why, the summary repeats the
 * reason under the saved value: AI features off (template copy whatever the
 * LLM mode) and the Discord bot off (no DMs).
 *
 * The season row carries the zone note and its "Change the server time zone"
 * link; the form shows its own copy while editing, so only one is mounted.
 */
export function RewindSettingsSummary({ saved, zone, llmDisabled, discordBotOn, budget, spent, libraries }: RewindSettingsSummaryProps) {
  const libraryNames = saved.rewindExcludedSectionIds.map((id) => libraries?.find((library) => library.id === id)?.name ?? `Library ${id}`)
  const pages = REWIND_CUT_PAGES.filter((page) => saved.rewindDisabledPages.includes(page.key)).map((page) => page.label)
  const features = REWIND_FEATURES.filter((feature) => rewindFeatureOn(saved, feature.key))
  const channels = saved.rewindNotifyChannels.map((channel) => (channel === "discord" ? "Discord DM" : "Dashboard banner"))

  return (
    <div className="flex flex-col gap-6" data-testid="settings-rewind-summary">
      <Group title="Availability">
        <SettingsSummaryRow label="Rewind" data-testid={row("enabled")}>
          {onOff(saved.rewindEnabled)}
        </SettingsSummaryRow>
        <SettingsSummaryRow label="Audience" data-testid={row("audience")}>
          {labelOf(AUDIENCES, saved.rewindAudience)}
        </SettingsSummaryRow>
      </Group>

      <Group title="Season">
        <SettingsSummaryRow label="Dates" wide data-testid={row("season")}>
          <WithNote note={<TimeZoneNote zone={zone} />}>
            {monthDayLabel(saved.rewindSeasonOpens)} to {monthDayLabel(saved.rewindSeasonCloses)}
          </WithNote>
        </SettingsSummaryRow>
      </Group>

      <Group title="AI text">
        <SettingsSummaryRow label="LLM mode" data-testid={row("llm-mode")}>
          <WithNote note={llmDisabled && "AI features are off. Rewind uses template text."}>{labelOf(LLM_MODES, saved.rewindLlmMode)}</WithNote>
        </SettingsSummaryRow>
        <SettingsSummaryRow label="Season budget" data-testid={row("budget")}>
          <WithNote note={`${spent} spent so far.`}>{budget}</WithNote>
        </SettingsSummaryRow>
      </Group>

      <Group title="Sharing">
        <SettingsSummaryRow label="Public links" data-testid={row("public-links")}>
          {onOff(saved.rewindPublicLinks)}
        </SettingsSummaryRow>
        <SettingsSummaryRow label="Public counts" data-testid={row("public-counts")}>
          {onOff(saved.rewindPublicCounts)}
        </SettingsSummaryRow>
        <SettingsSummaryRow label="Server name on cards" data-testid={row("server-name")}>
          {onOff(saved.rewindShowServerNameOnCards)}
        </SettingsSummaryRow>
        <SettingsSummaryRow label="Artwork on cards" data-testid={row("artwork")}>
          {onOff(saved.rewindAllowArtOnCards)}
        </SettingsSummaryRow>
      </Group>

      <Group title="Content">
        <SettingsSummaryRow label="Include managed accounts" data-testid={row("managed")}>
          {onOff(saved.rewindIncludeManagedUsers)}
        </SettingsSummaryRow>
        <SettingsSummaryRow label="Excluded libraries" data-testid={row("libraries")}>
          {list(libraryNames, "None")}
        </SettingsSummaryRow>
        <SettingsSummaryRow label="Excluded content ratings" data-testid={row("ratings")}>
          {list(saved.rewindExcludedContentRatings, "None")}
        </SettingsSummaryRow>
        <SettingsSummaryRow label="Disabled pages" data-testid={row("pages")}>
          {list(pages, "None")}
        </SettingsSummaryRow>
        <SettingsSummaryRow label="Opt-in features" wide data-testid={row("features")}>
          {features.length > 0 ? (
            <ul className="flex flex-col gap-1">
              {features.map((feature) => (
                <li key={feature.key}>{feature.label}</li>
              ))}
            </ul>
          ) : (
            <NotSet>None on</NotSet>
          )}
        </SettingsSummaryRow>
      </Group>

      <Group title="Notifications">
        <SettingsSummaryRow label="Ready notifications" data-testid={row("channels")}>
          <WithNote note={!discordBotOn && "The Discord bot is off. Turn it on to send DMs."}>{list(channels, "None")}</WithNote>
        </SettingsSummaryRow>
      </Group>
    </div>
  )
}
