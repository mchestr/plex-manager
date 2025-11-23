"use client"

import { motion } from "framer-motion"

interface PlexConfigurationStepProps {
  onComplete: () => void
  onBack: () => void
}

export function PlexConfigurationStep({ onComplete, onBack }: PlexConfigurationStepProps) {
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

        <h2 className="text-2xl font-bold text-white">
          Optimal Configuration
        </h2>
        <p className="text-slate-300 text-base">
          To ensure the best possible quality and prevent buffering, please update your Plex client settings.
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
            By default, some Plex clients (like TV apps or Browsers) limit quality to 720p. This causes the server to &ldquo;transcode&rdquo; (convert) video, which reduces quality and can cause buffering.
          </p>

          <div className="bg-slate-900/50 p-4 rounded-md border-l-4 border-amber-500">
            <h4 className="font-medium text-amber-400 mb-1">How to fix it:</h4>
            <ol className="list-decimal list-inside space-y-2 text-sm">
              <li>Open Plex <strong>Settings</strong> within the app on your device.</li>
              <li>Go to <strong>Video</strong> or <strong>Quality</strong>.</li>
              <li>Set <strong>Remote Streaming</strong> (or Internet Streaming) to <strong className="text-white">Maximum</strong> or <strong className="text-white">Original</strong>.</li>
              <li>Turn <strong className="text-white">OFF</strong> &ldquo;Adjust Automatically&rdquo;.</li>
            </ol>
          </div>
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.4 }}
        className="flex justify-between pt-4"
      >
        <button
          onClick={onBack}
          className="px-4 py-2 text-slate-400 hover:text-white transition-colors font-medium"
        >
          Back
        </button>
        <button
          onClick={onComplete}
          className="px-6 py-2 bg-cyan-600 hover:bg-cyan-700 text-white font-medium rounded-lg transition-colors"
        >
          Got it
        </button>
      </motion.div>
    </div>
  )
}

