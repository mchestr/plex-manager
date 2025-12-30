"use client"

import { Button } from "@/components/ui/button"
import { motion } from "framer-motion"

interface MediaRequestStepProps {
  onComplete: () => void
  onBack: () => void
  overseerrUrl: string | null
}

export function MediaRequestStep({ onComplete, onBack, overseerrUrl }: MediaRequestStepProps) {
  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center space-y-4"
      >
        <div className="flex justify-center mb-4">
          <div className="p-3 bg-purple-500/10 rounded-full text-purple-400">
            <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
            </svg>
          </div>
        </div>

        <h2 data-testid="onboarding-media-request-heading" className="text-2xl font-bold text-white">
          Requesting Media
        </h2>
        <p className="text-slate-300 text-base">
          Missing a movie or TV show? You can request it directly!
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="space-y-6"
      >
        <div className="bg-slate-800/50 rounded-lg p-6 border border-slate-700">
          <p className="text-slate-300 mb-4">
            We use a request system that automatically approves and downloads content based on availability and server rules.
          </p>

          {overseerrUrl ? (
            <div className="flex flex-col items-center space-y-4 p-4 bg-slate-900/50 rounded-lg border border-purple-500/30">
              <p className="text-sm text-slate-400">Request Portal Available At:</p>
              <a
                href={overseerrUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-purple-400 hover:text-purple-300 font-semibold underline text-lg truncate max-w-full"
              >
                {overseerrUrl}
              </a>
              <p className="text-xs text-slate-500">
                Log in with your Plex account.
              </p>
            </div>
          ) : (
            <div className="p-4 bg-slate-900/50 rounded-lg border border-slate-700 text-center space-y-2">
              <p className="text-slate-400 text-sm">
                A request portal has not been configured or linked yet.
              </p>
              <div className="text-xs text-slate-500 pt-2 border-t border-slate-700/50">
                 <p>If you are the admin, you can configure this in <span className="text-purple-400">Admin &gt; Settings &gt; Overseerr</span>.</p>
              </div>
            </div>
          )}
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.4 }}
        className="flex justify-between pt-4"
      >
        <Button
          onClick={onBack}
          data-testid="onboarding-media-request-back"
          variant="ghost"
        >
          Back
        </Button>
        <Button
          onClick={onComplete}
          data-testid="onboarding-media-request-continue"
        >
          Next
        </Button>
      </motion.div>
    </div>
  )
}

