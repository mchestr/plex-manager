"use client"

import type { ReactNode } from "react"

import type { StripeConfigStatus } from "@/types/admin"
import { StripeSettingsFields, useStripeForm } from "@/components/admin/settings/stripe-settings-form"
import { SettingsSection } from "@/components/ui/settings-section"
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

/**
 * Stripe billing (P10.20): the Subscriptions switch saves on its own; the
 * keys, prices and libraries save through the section footer. The switch's
 * prerequisites show as one Alert, and fields turn red only after a save.
 */
export function StripeSection({ config, libraries, health, footerMeta }: StripeSectionProps) {
  const stripe = useStripeForm(config)
  return (
    <SettingsSection
      id="stripe"
      title="Stripe billing"
      description="Gate server access behind a Stripe subscription for non-members."
      status={health.status}
      checkedAt={health.checkedAt}
      form={stripe.form}
      footerMeta={footerMeta}
    >
      <StripeSettingsFields config={config} state={stripe} libraries={libraries} />
    </SettingsSection>
  )
}
