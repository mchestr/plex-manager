"use client"

interface WizardFormActionsProps {
  /** When provided, renders a Back button that calls this on click. */
  onBack?: () => void
  /** Disables both buttons and shows the pending label on submit. */
  isPending: boolean
  /** Disables both buttons and shows "Success!" on submit. */
  isSuccess: boolean
  /** Submit label shown while pending (default: "Testing connection..."). */
  pendingLabel?: string
  /** Submit label in the idle state (default: "Continue"). */
  submitLabel?: string
  /** data-testid for the submit button (default: "setup-form-submit"). */
  submitTestId?: string
}

/**
 * Shared Back / Continue action row for the setup-wizard step forms.
 *
 * Every wizard step (Plex, Tautulli, Overseerr, Sonarr, Radarr, Prometheus,
 * LLM, Discord) previously hand-copied this exact markup. The distinctive
 * 3-color gradient + purple focus ring + rounded-md are intentional to the
 * setup wizard and differ from the app-wide <Button> primitive, so they are
 * preserved verbatim here rather than routed through <Button>.
 */
export function WizardFormActions({
  onBack,
  isPending,
  isSuccess,
  pendingLabel = "Testing connection...",
  submitLabel = "Continue",
  submitTestId = "setup-form-submit",
}: WizardFormActionsProps) {
  const disabled = isPending || isSuccess

  return (
    <div className="flex justify-between pt-4">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          disabled={disabled}
          className="inline-flex justify-center rounded-md border border-slate-600 bg-slate-800/80 hover:bg-slate-700/80 py-2 px-6 text-sm font-medium text-slate-200 shadow-lg hover:text-white focus:outline-none focus:ring-2 focus:ring-cyan-400/50 focus:ring-offset-2 focus:ring-offset-slate-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 hover:border-slate-500"
        >
          Back
        </button>
      )}
      <div className="ml-auto">
        <button
          type="submit"
          data-testid={submitTestId}
          disabled={disabled}
          className="inline-flex justify-center rounded-md py-2 px-6 text-sm font-medium text-white shadow-lg focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:ring-offset-2 focus:ring-offset-slate-900 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 bg-gradient-to-r from-cyan-600 via-purple-600 to-pink-600 hover:from-cyan-500 hover:via-purple-500 hover:to-pink-500"
        >
          {isPending ? pendingLabel : isSuccess ? "Success!" : submitLabel}
        </button>
      </div>
    </div>
  )
}
