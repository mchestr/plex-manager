import { Alert } from "@/components/ui/alert"
import type { DevDefaults } from "@/types/setup"

interface DevModeBannerProps {
  devDefaults: DevDefaults
}

/**
 * The warning shown while DEV_* environment variables pre-fill the setup
 * forms, as a reminder that they must never reach production.
 */
export function DevModeBanner({ devDefaults }: DevModeBannerProps) {
  if (!devDefaults.isDevMode) {
    return null
  }

  return (
    <Alert tone="warning" title="Development mode is on" aria-live="polite" data-testid="dev-mode-banner">
      <p>
        <code className="font-mono">DEV_*</code> environment variables fill in these forms.
        {devDefaults.autoSubmit && <span className="ml-1 font-medium text-foreground">Auto-submit is on.</span>}
      </p>
      <p className="mt-1">
        Do not use them in production. Environment variables keep secrets in plain text, and logs can show them.
      </p>
    </Alert>
  )
}
