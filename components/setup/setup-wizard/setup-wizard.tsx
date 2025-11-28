"use client"

import { completeSetup } from "@/actions/setup"
import { DiscordIntegrationForm } from "@/components/setup/setup-wizard/discord-integration-form"
import { FinalSuccessAnimation } from "@/components/setup/setup-wizard/final-success-animation"
import { LLMProviderForm } from "@/components/setup/setup-wizard/llm-provider-form"
import { OverseerrForm } from "@/components/setup/setup-wizard/overseerr-form"
import { PlexServerForm } from "@/components/setup/setup-wizard/plex-server-form"
import { RadarrForm } from "@/components/setup/setup-wizard/radarr-form"
import { SonarrForm } from "@/components/setup/setup-wizard/sonarr-form"
import { SuccessAnimation } from "@/components/setup/setup-wizard/success-animation"
import { TautulliForm } from "@/components/setup/setup-wizard/tautulli-form"
import { SETUP_STEPS } from "@/types/setup"
import { AnimatePresence, motion } from "framer-motion"
import { useRouter } from "next/navigation"
import { useState } from "react"

interface SetupWizardProps {
  currentStep: number
}

export function SetupWizard({ currentStep: initialStep }: SetupWizardProps) {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState(initialStep)
  const [showSuccess, setShowSuccess] = useState(false)
  const [showFinalSuccess, setShowFinalSuccess] = useState(false)
  const totalSteps = SETUP_STEPS.length
  const visibleStep = Math.min(currentStep, totalSteps)
  const progressPercent =
    totalSteps > 1
      ? Math.min(((currentStep - 1) / (totalSteps - 1)) * 100, 100)
      : currentStep > 0
      ? 100
      : 0

  const handleStepComplete = () => {
    const isFinalStep = currentStep === totalSteps
    if (isFinalStep) {
      setShowFinalSuccess(true)
    } else if (currentStep < totalSteps) {
      setShowSuccess(true)
    }
  }

  const handleSuccessComplete = () => {
    setShowSuccess(false)
    setCurrentStep(currentStep + 1)
  }

  const handleFinalSuccessComplete = async () => {
    // Mark setup as complete in the database
    await completeSetup()
    // Redirect to home page
    router.push("/")
  }

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1)
    }
  }

  const renderStep = () => {
    if (currentStep > totalSteps) {
      return (
        <div className="space-y-4 text-white">
          <p className="text-lg font-semibold">You're ready to finish setup</p>
          <p className="text-sm text-slate-300">
            All configuration steps are complete. Launch the final animation to mark setup as
            finished and start using Plex Manager.
          </p>
          <button
            type="button"
            onClick={() => setShowFinalSuccess(true)}
            className="inline-flex justify-center rounded-md py-2 px-6 text-sm font-medium text-white shadow-lg focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:ring-offset-2 focus:ring-offset-slate-900 transition-all duration-200 bg-gradient-to-r from-cyan-600 via-purple-600 to-pink-600 hover:from-cyan-500 hover:via-purple-500 hover:to-pink-500"
          >
            Finish setup
          </button>
        </div>
      )
    }

    switch (currentStep) {
      case 1:
        return <PlexServerForm onComplete={handleStepComplete} onBack={undefined} />
      case 2:
        return <TautulliForm onComplete={handleStepComplete} onBack={handleBack} />
      case 3:
        return <OverseerrForm onComplete={handleStepComplete} onBack={handleBack} />
      case 4:
        return <SonarrForm onComplete={handleStepComplete} onBack={handleBack} />
      case 5:
        return <RadarrForm onComplete={handleStepComplete} onBack={handleBack} />
      case 6:
        return <DiscordIntegrationForm onComplete={handleStepComplete} onBack={handleBack} />
      case 7:
        return <LLMProviderForm purpose="chat" onComplete={handleStepComplete} onBack={handleBack} />
      case 8:
        return <LLMProviderForm purpose="wrapped" onComplete={handleStepComplete} onBack={handleBack} />
      default:
        return <div className="text-white">Step {currentStep} - Coming soon</div>
    }
  }

  return (
    <>
      {/* Success Animation Overlay */}
      <AnimatePresence>
        {showSuccess && (
          <SuccessAnimation onComplete={handleSuccessComplete} />
        )}
        {showFinalSuccess && (
          <FinalSuccessAnimation onComplete={handleFinalSuccessComplete} />
        )}
      </AnimatePresence>

      <div className="max-w-3xl mx-auto relative z-10">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-8"
        >
          <h1 className="text-4xl font-bold mb-2 drop-shadow-lg bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
            Welcome to Plex Manager
          </h1>
          <p className="text-slate-300 text-lg" data-testid="setup-wizard-intro-text">
            Let's get your Plex Manager setup configured
          </p>
        </motion.div>

        {/* Step Indicator */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="mb-8 space-y-4"
        >
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2 bg-slate-800/60 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-500 transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
                aria-hidden="true"
              />
            </div>
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Step {visibleStep} / {totalSteps}
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {SETUP_STEPS.map((step, index) => {
              const isComplete = step.id < currentStep
              const isActive = step.id === currentStep
              const stateClasses = isComplete
                ? "border-cyan-500/40 bg-gradient-to-br from-cyan-500/20 to-purple-500/10 shadow-[0_10px_40px_rgba(34,211,238,0.15)]"
                : isActive
                ? "border-cyan-400/40 bg-slate-900/70 shadow-[0_10px_30px_rgba(34,211,238,0.1)]"
                : "border-slate-700/80 bg-slate-900/40"

              return (
                <motion.div
                  key={step.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.04 }}
                  className={`rounded-xl border px-4 py-3 backdrop-blur-sm transition-colors duration-300 ${stateClasses}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div
                      className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold ${
                        isComplete
                          ? "bg-cyan-400 text-slate-900"
                          : isActive
                          ? "border border-cyan-400 text-cyan-300"
                          : "border border-slate-600 text-slate-400"
                      }`}
                      aria-hidden="true"
                    >
                      {isComplete ? (
                        <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                          <path
                            fillRule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                            clipRule="evenodd"
                          />
                        </svg>
                      ) : (
                        step.id
                      )}
                    </div>
                    <span className="text-[10px] uppercase tracking-wide text-slate-500">
                      {isComplete ? "Complete" : isActive ? "In progress" : "Upcoming"}
                    </span>
                  </div>
                  <div className="mt-3">
                    <p className="text-sm font-semibold text-white">{step.title}</p>
                    <p className="mt-1 text-xs text-slate-400 leading-relaxed">{step.description}</p>
                  </div>
                </motion.div>
              )
            })}
          </div>
        </motion.div>

        {/* Step Content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.4 }}
            className="bg-slate-900/90 border border-cyan-400/20 shadow-2xl rounded-lg p-6"
            style={{ backdropFilter: "blur(8px)" }}
          >
            {renderStep()}
          </motion.div>
        </AnimatePresence>
      </div>
    </>
  )
}
