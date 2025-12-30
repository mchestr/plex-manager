"use client"

import { Button } from "@/components/ui/button"
import { motion } from "framer-motion"

interface JellyfinConfigurationStepProps {
  onComplete: () => void
  onBack: () => void
}

export function JellyfinConfigurationStep({ onComplete, onBack }: JellyfinConfigurationStepProps) {
  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="text-center space-y-4"
      >
        <div className="flex justify-center mb-4">
          <div className="p-3 bg-amber-500/10 rounded-full text-amber-400">
            <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
            </svg>
          </div>
        </div>

        <h2 data-testid="onboarding-jellyfin-config-heading" className="text-2xl font-bold text-white">
          Optimal Configuration
        </h2>
        <p className="text-slate-300 text-base">
          To ensure the best possible quality and prevent buffering, please update your Jellyfin client settings.
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="bg-slate-800/50 rounded-lg p-6 border border-slate-700 space-y-4"
      >
        <h3 className="text-lg font-semibold text-white border-b border-slate-700 pb-2">
          Video Quality Settings
        </h3>
        <div className="space-y-4 text-slate-300">
          <p>
            By default, some Jellyfin clients may limit quality or adjust it automatically. This can cause the server to transcode (convert) video, which reduces quality and can cause buffering.
          </p>

          <div className="bg-slate-900/50 p-4 rounded-md border-l-4 border-amber-500">
            <h4 className="font-medium text-amber-400 mb-1">How to fix it:</h4>
            <ol className="list-decimal list-inside space-y-2 text-sm">
              <li>Open Jellyfin <strong>Settings</strong> within the app on your device.</li>
              <li>Go to <strong>Playback</strong> → <strong>Quality</strong>.</li>
              <li>Set <strong>Internet streaming quality</strong> to <strong className="text-white">Maximum</strong>.</li>
              <li>Disable <strong className="text-white">&ldquo;Auto adjust quality&rdquo;</strong>.</li>
            </ol>
          </div>

          <div className="bg-cyan-500/10 p-4 rounded-md border-l-4 border-cyan-500">
            <p className="text-sm text-cyan-300">
              <strong>Tip:</strong> These settings may vary slightly depending on your Jellyfin client (web, mobile, TV app). Look for similar quality or playback settings in your specific client.
            </p>
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
          data-testid="onboarding-jellyfin-config-back"
          variant="ghost"
        >
          Back
        </Button>
        <Button
          onClick={onComplete}
          data-testid="onboarding-jellyfin-config-continue"
        >
          Got it
        </Button>
      </motion.div>
    </div>
  )
}
