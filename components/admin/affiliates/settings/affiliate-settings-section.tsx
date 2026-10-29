"use client"

import { Suspense, use } from "react"

import { Skeleton } from "@/components/ui/skeleton"
import { SettingsSection } from "@/components/ui/settings-section"
import { NotSet, SettingsSummary, SettingsSummaryRow } from "@/components/ui/settings-summary"
import type { AffiliateSettingsView } from "@/lib/data/affiliate-settings"
import type { LibraryListing } from "@/types/invite"

import { AffiliateSettingsFields, useAffiliateSettingsForm } from "./affiliate-settings-form"
import { ShareCount } from "./share-count"

interface AffiliateSettingsSectionProps {
  saved: AffiliateSettingsView
  /** The Plex libraries, streamed. */
  libraries: Promise<LibraryListing>
  /** The users the Plex server shares with now, streamed; null when Plex can't answer. */
  shareCount: Promise<number | null>
}

const row = (key: string) => `settings-affiliates-summary-${key}`

function capText(cap: number | null): string {
  if (cap === null) return "No cap"
  if (cap === 0) return "0. No new affiliate invites."
  return `${cap} ${cap === 1 ? "join" : "joins"} per 30 days`
}

/** The saved library keys as names, or as keys while Plex can't list them. */
function LibraryNames({ ids, libraries }: { ids: number[]; libraries: Promise<LibraryListing> }) {
  const listing = use(libraries)
  const names = ids.map((id) => (listing.ok ? listing.libraries.find((library) => library.id === String(id))?.name : undefined) ?? `Library ${id}`)
  return <>{names.join(", ")}</>
}

function AffiliateSettingsSummary({ saved, libraries, shareCount }: AffiliateSettingsSectionProps) {
  return (
    <SettingsSummary data-testid="settings-affiliates-summary">
      <SettingsSummaryRow label="Affiliate invites" data-testid={row("enabled")}>
        {saved.enabled ? "On" : "Off"}
      </SettingsSummaryRow>
      <SettingsSummaryRow label="Server cap" data-testid={row("cap")}>
        {capText(saved.cap)}
        <span className="block text-label text-muted-foreground">
          <ShareCount count={shareCount} />
        </span>
      </SettingsSummaryRow>
      <SettingsSummaryRow label="Tiers" wide data-testid={row("tiers")}>
        <ul className="flex flex-col gap-1">
          {saved.tiers.map((tier, index) => (
            <li key={tier.overHours} data-testid={row(`tier-${index + 1}`)}>
              More than {tier.overHours} h: {tier.invites} {tier.invites === 1 ? "invite" : "invites"} per 30 days
            </li>
          ))}
        </ul>
      </SettingsSummaryRow>
      <SettingsSummaryRow label="Libraries" wide data-testid={row("libraries")}>
        {saved.libraryIds.length === 0 ? (
          <NotSet />
        ) : (
          <Suspense fallback={`${saved.libraryIds.length} libraries`}>
            <LibraryNames ids={saved.libraryIds} libraries={libraries} />
          </Suspense>
        )}
      </SettingsSummaryRow>
    </SettingsSummary>
  )
}

/**
 * The affiliate settings (admins only): read-only first, then Edit. The
 * switch saves with Save, like the other fields.
 */
export function AffiliateSettingsSection(props: AffiliateSettingsSectionProps) {
  const state = useAffiliateSettingsForm(props.saved)
  return (
    <SettingsSection
      id="affiliates"
      title="Affiliate invites"
      description="Approved affiliates can invite people to the Plex server. Each invite is for one person and expires after 48 hours."
      form={state.form}
      view={<AffiliateSettingsSummary {...props} />}
    >
      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        <AffiliateSettingsFields state={state} libraries={props.libraries} shareCount={props.shareCount} />
      </Suspense>
    </SettingsSection>
  )
}
