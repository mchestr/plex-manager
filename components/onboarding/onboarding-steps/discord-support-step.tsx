"use client"

import { Button } from "@/components/ui/button"
import { motion } from "framer-motion"
import Link from "next/link"

interface DiscordSupportStepProps {
  onComplete: () => void
  onBack: () => void
  discordEnabled: boolean
  instructions?: string | null
}

export function DiscordSupportStep({ onComplete, onBack, discordEnabled, instructions }: DiscordSupportStepProps) {
  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center space-y-4"
      >
        <div className="flex justify-center mb-4">
          <div className="p-3 bg-indigo-500/10 rounded-full text-indigo-400">
            <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
          </div>
        </div>

        <h2 data-testid="onboarding-discord-support-heading" className="text-2xl font-bold text-white">
          Support & Community
        </h2>
        <p className="text-slate-300 text-base">
          Get help when you need it and connect with other members through Discord.
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="space-y-6"
      >
        <div className="bg-slate-800/50 rounded-lg p-6 border border-slate-700 space-y-4">
          <h3 className="text-lg font-semibold text-white border-b border-slate-700 pb-2">
            Reporting Issues
          </h3>
          <div className="space-y-4 text-slate-300">
            <p>
              Having trouble with playback, subtitles, or missing content? If you encounter any issues, please report them so we can fix them as soon as possible.
            </p>

            <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700">
              <div className="flex items-start space-x-3">
                <div className="text-indigo-400 mt-1">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                  </svg>
                </div>
                <div>
                  <h4 className="font-medium text-white mb-1">Contact Support</h4>
                  <p className="text-sm text-slate-400">
                    Join our Discord server for instant support. Link your account to get help directly from admins and the community.
                  </p>
                </div>
              </div>
            </div>

            <p className="text-xs text-slate-500 italic text-center pt-2">
              Please include the movie/show name and a description of the problem when reporting issues.
            </p>
          </div>
        </div>

        <div className="bg-slate-800/50 rounded-lg p-6 border border-slate-700 space-y-4">
          <h3 className="text-lg font-semibold text-white border-b border-slate-700 pb-2">
            Discord Community
          </h3>
          <div className="space-y-4 text-slate-300">
            <p>
              Link your Discord account to unlock instant access to support, outage alerts, and a private community of other Plex members.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                {
                  title: "Live Support",
                  description: "Chat directly with admins when something breaks.",
                  icon: (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                    </svg>
                  ),
                },
                {
                  title: "Community Picks",
                  description: "See what others are watching and share recommendations.",
                  icon: (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-5M7 4H2v5M21 3l-6 6M3 21l6-6" />
                    </svg>
                  ),
                },
                {
                  title: "Faster Help",
                  description: "Linked role proves you're a Plex member, so the bot responds instantly.",
                  icon: (
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  ),
                },
              ].map((item) => (
                <div key={item.title} className="bg-slate-900/50 p-4 rounded-lg border border-slate-700">
                  <div className="text-indigo-400 mb-2">{item.icon}</div>
                  <h4 className="text-white font-semibold mb-1">{item.title}</h4>
                  <p className="text-sm text-slate-400">{item.description}</p>
                </div>
              ))}
            </div>

            {instructions && (
              <div className="bg-slate-900/50 p-4 rounded-lg border border-slate-700">
                <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Server Notes</div>
                <p className="text-sm text-slate-300 whitespace-pre-line">{instructions}</p>
              </div>
            )}

            <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
              <div>
                <p className="text-white font-medium">
                  {discordEnabled ? "Ready to link your Discord?" : "Discord linking is coming soon"}
                </p>
                <p className="text-sm text-slate-400 mt-1">
                  {discordEnabled
                    ? "We'll open a new window with the support portal. Come back after linking to continue."
                    : "Your Plex admin hasn't enabled the Discord portal yet."}
                </p>
              </div>
              {discordEnabled ? (
                <Link
                  href="/discord/link"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors"
                >
                  Open Portal
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h6m0 0v6m0-6L10 16" />
                  </svg>
                </Link>
              ) : (
                <Button
                  type="button"
                  disabled
                  variant="secondary"
                >
                  Portal Unavailable
                </Button>
              )}
            </div>
          </div>
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
          data-testid="onboarding-discord-support-back"
          variant="ghost"
        >
          Back
        </Button>
        <Button
          onClick={onComplete}
          data-testid="onboarding-discord-support-continue"
        >
          Next
        </Button>
      </motion.div>
    </div>
  )
}
