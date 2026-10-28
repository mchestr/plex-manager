import { SettingsSection } from "@/components/ui/settings-section"
import { Time } from "@/components/ui/time"

/**
 * Privacy (P11.14): when the daily retention sweep last finished. Its windows
 * come from `RETENTION_<NAME>_DAYS` and are listed in `docs/privacy.md`.
 */
export function PrivacySection({ lastRun }: { lastRun: Date | null }) {
  return (
    <SettingsSection id="privacy" title="Privacy" description="Old personal data is deleted once a day.">
      <p className="text-ui text-muted-foreground" data-testid="settings-retention-last-run">
        {lastRun ? (
          <>
            Last run <Time value={lastRun} nowLabel="just now" />
          </>
        ) : (
          "Not run yet."
        )}
      </p>
    </SettingsSection>
  )
}
