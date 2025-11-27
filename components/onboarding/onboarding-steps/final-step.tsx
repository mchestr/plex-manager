"use client"

import { motion } from "framer-motion"

interface FinalStepProps {
  onComplete: () => void
  onBack: () => void
}

export function FinalStep({ onComplete, onBack }: FinalStepProps) {
  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, type: "spring", stiffness: 200 }}
        className="text-center space-y-4"
      >
        <div className="flex justify-center mb-6">
          <motion.div
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
            className="w-32 h-32 bg-gradient-to-br from-cyan-500 via-purple-500 to-pink-500 rounded-full flex items-center justify-center shadow-2xl shadow-cyan-500/30"
          >
            <svg className="w-16 h-16 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
              />
            </svg>
          </motion.div>
        </div>

        <h2 data-testid="onboarding-final-heading" className="text-3xl font-bold bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
          You're All Set!
        </h2>
        <p className="text-slate-300 text-lg leading-relaxed">
          You're ready to start exploring the dashboard.
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.3 }}
        className="bg-slate-800/50 rounded-lg p-6 border border-cyan-500/20"
      >
        <h3 className="text-white font-semibold mb-3">What's Next:</h3>
        <ul className="space-y-2 text-slate-300">
          <li className="flex items-start">
            <span className="text-cyan-400 mr-2">•</span>
            <span>Browse available media on the Plex app</span>
          </li>
          <li className="flex items-start">
            <span className="text-purple-400 mr-2">•</span>
            <span>View server statistics and insights</span>
          </li>
          <li className="flex items-start">
            <span className="text-pink-400 mr-2">•</span>
            <span>Manage your requests and watch history</span>
          </li>
        </ul>
      </motion.div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.5 }}
        className="flex justify-between pt-4"
      >
        <button
          onClick={onBack}
          data-testid="onboarding-final-back"
          className="px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white font-medium rounded-lg transition-colors"
        >
          Back
        </button>
        <button
          onClick={onComplete}
          data-testid="onboarding-final-complete"
          className="px-6 py-3 bg-gradient-to-r from-cyan-600 to-purple-600 hover:from-cyan-700 hover:to-purple-700 text-white font-medium rounded-lg transition-all shadow-lg shadow-cyan-500/20"
        >
          Go to Dashboard
        </button>
      </motion.div>
    </div>
  )
}
