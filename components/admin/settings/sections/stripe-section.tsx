"use client"

import { type ReactNode, Suspense, use } from "react"

import type { StripeConfigStatus } from "@/types/admin"
import { StripeSettingsFields, StripeSubscriptions, useStripeForm } from "@/components/admin/settings/stripe-settings-form"
import { SettingsSection } from "@/components/ui/settings-section"
import { NotSet, SecretSummary, SettingsSummary, SettingsSummaryRow } from "@/components/ui/settings-summary"
import type { SectionHealth } from "@/lib/settings/connection-status"
import type { LibraryListing } from "@/types/invite"

interface StripeSectionProps {
  config: StripeConfigStatus
  /** The Plex libraries for the subscriber picker, started by the page. */
  libraries: Promise<LibraryListing>
  health: SectionHealth
  /** "Last saved ... by ..." from the audit log. */
  footerMeta?: ReactNode
}

/** "1 library", "3 libraries". */
const libraryCount = (n: number) => `${n} ${n === 1 ? "library" : "libraries"}`

/**
 * The chosen libraries by name, once the page's Plex listing arrives. An id
 * Plex no longer lists is counted, since grants skip it (docs/stripe.md); a
 * listing that failed leaves just the count.
 */
function LibraryNames({ libraries, ids }: { libraries: Promise<LibraryListing>; ids: number[] }) {
  const listing = use(libraries)
  if (!listing.ok) return libraryCount(ids.length)
  const names = listing.libraries.filter((library) => ids.includes(Number(library.id))).map((library) => library.name)
  const gone = ids.length - names.length
  if (gone === 0) return names.join(", ")
  return `${names.length > 0 ? `${names.join(", ")} and ` : ""}${libraryCount(gone)} no longer in Plex`
}

interface StripeSummaryProps {
  config: StripeConfigStatus
  libraries: Promise<LibraryListing>
  /** Opens the form on a key the current encryption key can't read. */
  onReenter: (field: "secret-key" | "webhook-secret") => void
}

/**
 * The saved Stripe settings, in the edit form's order. The keys show only
 * that they are saved; the libraries read "All libraries" when none is
 * chosen, and their names stream in without holding the section up.
 */
function StripeSummary({ config, libraries, onReenter }: StripeSummaryProps) {
  const row = (key: string) => `settings-stripe-summary-${key}`
  const ids = config.librarySectionIds
  return (
    <SettingsSummary data-testid="settings-stripe-summary">
      <SettingsSummaryRow label="Secret key" data-testid={row("secret-key")}>
        <SecretSummary saved={config.saved.secretKey} noun="secret key" onReenter={() => onReenter("secret-key")} reenterTestId={`${row("secret-key")}-reenter`} />
      </SettingsSummaryRow>
      <SettingsSummaryRow label="Webhook signing secret" data-testid={row("webhook-secret")}>
        <SecretSummary
          saved={config.saved.webhookSecret}
          noun="webhook signing secret"
          onReenter={() => onReenter("webhook-secret")}
          reenterTestId={`${row("webhook-secret")}-reenter`}
        />
      </SettingsSummaryRow>
      <SettingsSummaryRow label="Price IDs" mono={config.priceIds.length > 0} data-testid={row("price-ids")}>
        {config.priceIds.length > 0 ? (
          <ul className="flex flex-col gap-1">
            {config.priceIds.map((id, index) => (
              <li key={`${index}-${id}`}>{id}</li>
            ))}
          </ul>
        ) : (
          <NotSet>None</NotSet>
        )}
      </SettingsSummaryRow>
      <SettingsSummaryRow label="Subscriber library access" data-testid={row("libraries")}>
        {ids.length === 0 ? (
          "All libraries"
        ) : (
          <Suspense fallback={libraryCount(ids.length)}>
            <LibraryNames libraries={libraries} ids={ids} />
          </Suspense>
        )}
      </SettingsSummaryRow>
    </SettingsSummary>
  )
}

/**
 * Stripe billing (P10.20): the Subscriptions switch and its prerequisite
 * Alert stay live in both modes and save at once. The keys, prices and
 * libraries show as a summary until Edit (Set up while none is saved) and
 * save through the section footer; fields turn red only after a save.
 */
export function StripeSection({ config, libraries, health, footerMeta }: StripeSectionProps) {
  const stripe = useStripeForm(config)
  // `saved`, not `hasSecretKey`: a key no encryption key can read is still stored, and the summary offers to enter it again (P11.1)
  const nothingSaved = !config.saved.secretKey && !config.saved.webhookSecret && config.priceIds.length === 0 && config.librarySectionIds.length === 0
  return (
    <SettingsSection
      id="stripe"
      title="Stripe billing"
      description="Gate server access behind a Stripe subscription for non-members."
      status={health.status}
      checkedAt={health.checkedAt}
      form={stripe.form}
      notSetUp={nothingSaved}
      live={<StripeSubscriptions config={config} />}
      view={(edit) => (
        <StripeSummary
          config={config}
          libraries={libraries}
          onReenter={(field) => edit({ focus: `[data-testid="stripe-${field}-input"]` })}
        />
      )}
      footerMeta={footerMeta}
    >
      <StripeSettingsFields config={config} state={stripe} libraries={libraries} />
    </SettingsSection>
  )
}
