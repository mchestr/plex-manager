"use client"

import { type DevDefaults } from "@/actions/dev-defaults"

interface DevModeBannerProps {
  devDefaults: DevDefaults | null
}

/**
 * Security warning banner shown when DEV_* environment variables are active.
 * This banner helps developers understand when they're using dev defaults
 * and reminds them about security implications.
 */
export function DevModeBanner({ devDefaults }: DevModeBannerProps) {
  if (!devDefaults?.isDevMode) {
    return null
  }

  return (
    <div
      data-testid="dev-mode-banner"
      className="mb-6 rounded-lg border border-amber-500/50 bg-amber-900/20 p-4"
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0">
          <svg
            className="h-5 w-5 text-amber-400"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
              clipRule="evenodd"
            />
          </svg>
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-medium text-amber-300">
            Development Mode Active
          </h3>
          <div className="mt-1 text-sm text-amber-200/80">
            <p>
              Form fields are being pre-populated from <code className="rounded bg-amber-800/50 px-1 py-0.5 text-xs">DEV_*</code> environment variables.
              {devDefaults.autoSubmit && (
                <span className="ml-1 font-medium text-amber-300">
                  Auto-submit is enabled.
                </span>
              )}
            </p>
            <p className="mt-2 text-xs text-amber-200/60">
              These variables should never be used in production. Secrets in environment
              variables are stored in plaintext and may be logged or exposed.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
