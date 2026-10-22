"use client"

import { Icon } from "@/components/ui/icon"
import { icons } from "@/lib/ui/icons"
import type { DevDefaults } from "@/types/setup"

interface DevModeBannerProps {
  devDefaults: DevDefaults
}

/**
 * Security warning banner shown when DEV_* environment variables are active.
 * This banner helps developers understand when they're using dev defaults
 * and reminds them about security implications.
 */
export function DevModeBanner({ devDefaults }: DevModeBannerProps) {
  if (!devDefaults.isDevMode) {
    return null
  }

  return (
    <div
      data-testid="dev-mode-banner"
      role="alert"
      aria-live="polite"
      className="mb-6 rounded-lg border border-amber-500/50 bg-amber-900/20 p-4"
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0">
          <Icon icon={icons.warning} size={20} className="text-amber-400" />
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
