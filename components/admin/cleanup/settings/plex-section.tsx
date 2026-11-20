"use client"

import { readTimeText } from "@/components/admin/cleanup/preview/read-time"
import { CheckboxField, onOff, SectionState, useCleanupSettingsForm } from "@/components/admin/cleanup/settings/section-parts"
import { Alert } from "@/components/ui/alert"
import { SettingsSection } from "@/components/ui/settings-section"
import { NotSet, SettingsSummary, SettingsSummaryRow } from "@/components/ui/settings-summary"
import { StatusBadge } from "@/components/ui/status-badge"
import { plural } from "@/lib/cleanup/action-words"
import { COLLECTION_TITLES } from "@/lib/cleanup/constants"
import { joinAnd, joinOr } from "@/lib/cleanup/fields/words"
import type { CleanupSettingsData } from "@/lib/cleanup/types/screens"
import { useFormat } from "@/lib/format-context"
import type { CleanupOptions } from "@/lib/validations/cleanup-options"
import { LEVELS } from "@/lib/validations/cleanup-vocabulary"

/** UX 8.8. */
const PLEX_WORDS = {
  title: "Plex visibility",
  description: "Where members see Leaving soon in Plex. A rule in Dry run never adds items.",
  order: "The soonest leave date first",
  kometaTitle: "Kometa runs every 8 hours",
  kometaBody: "If Kometa deletes collections that it does not manage, it removes these. plex-manager checks every hour, makes a missing collection again and tells you here.",
} as const

type PlexOptions = CleanupOptions["plex"]

const PLACES = [
  { key: "ownHome", on: "your Home", off: "on your Home" },
  { key: "sharedHome", on: "members' Home", off: "on members' Home" },
  { key: "recommended", on: "Recommended", off: "in Recommended" },
] as const

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

/** "Your Home and members' Home. Not in Recommended." (UX 8.8). @internal Tests check each mix. */
export function placesWords(plex: PlexOptions): string {
  const on = PLACES.filter((place) => plex[place.key]).map((place) => place.on)
  const off = PLACES.filter((place) => !plex[place.key]).map((place) => place.off)
  const parts = [on.length > 0 ? `${capitalise(joinAnd(on))}.` : null, off.length > 0 ? `Not ${joinOr(off)}.` : null]
  return parts.filter(Boolean).join(" ")
}

/** "Movies leaving soon: empty. Shows leaving soon: 21 shows. ..." (UX 8.8): each level's collections, summed over the libraries. @internal */
export function collectionsWords(collections: CleanupSettingsData["plex"]["collections"]): string {
  return LEVELS.map((level) => {
    const count = collections.filter((c) => c.level === level).reduce((sum, c) => sum + c.count, 0)
    return `${COLLECTION_TITLES[level]}: ${count > 0 ? plural(count, level) : "empty"}.`
  }).join(" ")
}

/** The read view (UX 4.10, 8.8). */
function PlexSummary({ data, now }: { data: CleanupSettingsData; now: number }) {
  const f = useFormat()
  const plex = data.options.plex
  const row = (key: string) => `settings-cleanup-plex-summary-${key}`
  return (
    <div className="flex flex-col gap-4">
      <SettingsSummary data-testid="settings-cleanup-plex-summary">
        <SettingsSummaryRow label="Leaving soon collections" data-testid={row("enabled")}>
          {onOff(plex.showCollections)}
        </SettingsSummaryRow>
        <SettingsSummaryRow label="Shows on" data-testid={row("places")}>
          {placesWords(plex)}
        </SettingsSummaryRow>
        <SettingsSummaryRow label="Collections" data-testid={row("collections")}>
          {collectionsWords(data.plex.collections)}
        </SettingsSummaryRow>
        <SettingsSummaryRow label="Order" data-testid={row("order")}>
          {PLEX_WORDS.order}
        </SettingsSummaryRow>
        <SettingsSummaryRow label="Collection summary" wide data-testid={row("text")}>
          {data.plex.summary ? `"${data.plex.summary}"` : <NotSet>Not set, because the app URL is not set</NotSet>}
        </SettingsSummaryRow>
      </SettingsSummary>
      {data.plex.notices.length > 0 && (
        <ul className="flex flex-col gap-1 text-label text-muted-foreground" data-testid="settings-cleanup-plex-notices">
          {data.plex.notices.map((notice) => (
            <li key={notice.key}>
              Kometa removed {notice.title} at {readTimeText(f, notice.detectedAt, now)}.
              {notice.recreatedAt ? ` plex-manager made it again at ${readTimeText(f, notice.recreatedAt, now)}.` : " plex-manager makes it again within the hour."}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * The Plex visibility section (UX 4.10, 8.8): "Working" or "Needs attention"
 * with the time of the last collection sync, where the Leaving soon
 * collections show, their counts and summary, and the Kometa note. Edit
 * holds four checkboxes. Places only matter while the collections show, so
 * they are disabled while that box is clear.
 */
export function PlexSection({ data, now }: { data: CleanupSettingsData; now: number }) {
  const f = useFormat()
  const saved = data.options.plex
  const { values, set, form } = useCleanupSettingsForm<PlexOptions>(saved, (plex) => ({ input: { section: "cleanup-plex", values: plex } }))
  const changed = (key: keyof PlexOptions) => (values[key] === saved[key] ? undefined : saved[key])
  const disabled = form.isPending
  const { working, checkedAt } = data.plex
  return (
    <SettingsSection
      id="cleanup-plex"
      title={PLEX_WORDS.title}
      description={PLEX_WORDS.description}
      form={form}
      badge={
        <SectionState
          badge={working ? <StatusBadge tone="success" label="Working" /> : <StatusBadge tone="warning" label="Needs attention" />}
          line={checkedAt ? `Checked ${readTimeText(f, checkedAt, now)}` : undefined}
          testId="settings-cleanup-plex-state"
        />
      }
      view={<PlexSummary data={data} now={now} />}
      after={
        <Alert tone="info" title={PLEX_WORDS.kometaTitle} data-testid="settings-cleanup-plex-kometa">
          {PLEX_WORDS.kometaBody}
        </Alert>
      }
    >
      <CheckboxField
        id="cleanup-plex-enabled"
        label="Show Leaving soon collections in Plex"
        checked={values.showCollections}
        onCheckedChange={(showCollections) => set({ showCollections })}
        disabled={disabled}
        changedFrom={changed("showCollections")}
      />
      <div className="flex flex-col gap-4 pl-7" role="group" aria-label="Where the collections show">
        <CheckboxField
          id="cleanup-plex-owner-home"
          label="On your Home"
          checked={values.ownHome}
          onCheckedChange={(ownHome) => set({ ownHome })}
          disabled={disabled || !values.showCollections}
          changedFrom={changed("ownHome")}
        />
        <CheckboxField
          id="cleanup-plex-shared-home"
          label="On members' Home"
          checked={values.sharedHome}
          onCheckedChange={(sharedHome) => set({ sharedHome })}
          disabled={disabled || !values.showCollections}
          changedFrom={changed("sharedHome")}
        />
        <CheckboxField
          id="cleanup-plex-recommended"
          label="In Recommended"
          checked={values.recommended}
          onCheckedChange={(recommended) => set({ recommended })}
          disabled={disabled || !values.showCollections}
          changedFrom={changed("recommended")}
        />
      </div>
    </SettingsSection>
  )
}
