"use client"

import { StripeSettingsForm } from "@/components/admin/settings/stripe-settings-form"
import { SettingsSection } from "@/components/ui/settings-section"
import type { SectionHealth } from "@/lib/settings/connection-status"

interface StripeSectionProps {
  config: {
    enabled: boolean
    hasSecretKey: boolean
    hasWebhookSecret: boolean
    hasJobQueue: boolean
    priceIds: string[]
    librarySectionIds: number[]
  }
  health: SectionHealth
}

/**
 * Stripe billing. Its switch and form save on their own until P10.20 moves
 * the keys onto SecretInput and the section footer.
 */
export function StripeSection({ config, health }: StripeSectionProps) {
  return (
    <SettingsSection
      id="stripe"
      title="Stripe billing"
      description="Gate server access behind a Stripe subscription for non-members."
      status={health.status}
      checkedAt={health.checkedAt}
    >
      <StripeSettingsForm {...config} />
    </SettingsSection>
  )
}
