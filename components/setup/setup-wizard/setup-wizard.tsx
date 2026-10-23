"use client"

import { completeSetup } from "@/actions/setup"
import { DevModeBanner } from "@/components/setup/setup-wizard/dev-mode-banner"
import { DiscordIntegrationForm } from "@/components/setup/setup-wizard/discord-integration-form"
import { FinalSuccessAnimation } from "@/components/setup/setup-wizard/final-success-animation"
import { LLMProviderForm } from "@/components/setup/setup-wizard/llm-provider-form"
import { OverseerrForm } from "@/components/setup/setup-wizard/overseerr-form"
import { PlexServerForm } from "@/components/setup/setup-wizard/plex-server-form"
import { PrometheusForm } from "@/components/setup/setup-wizard/prometheus-form"
import { RadarrForm } from "@/components/setup/setup-wizard/radarr-form"
import { SonarrForm } from "@/components/setup/setup-wizard/sonarr-form"
import { SuccessAnimation } from "@/components/setup/setup-wizard/success-animation"
import { TautulliForm } from "@/components/setup/setup-wizard/tautulli-form"
import { Icon } from "@/components/ui/icon"
import { icons } from "@/lib/ui/icons"
import { SkipStepButton } from "@/components/setup/setup-wizard/skip-step-button"
import {
  isOptionalStep,
  nextStepId,
  previousStepId,
  SETUP_STEPS,
  stepIndex,
  type DevDefaults,
  type SetupPosition,
} from "@/types/setup"
import { AnimatePresence, motion } from "motion/react"
import { useRouter } from "next/navigation"
import { useState } from "react"

interface SetupWizardProps {
  /** The step to show: the wizard's position, or an earlier step reached with Back (`?step=`). */
  position: SetupPosition
  /** The DEV_* pre-fill, read once by the setup page (P10.7). */
  devDefaults: DevDefaults
}

export function SetupWizard({ position, devDefaults }: SetupWizardProps) {
  const router = useRouter()
  // 1-based, as the step cards number them; the summary is one past the last step
  const currentStep = stepIndex(position) + 1
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

  // Every move is a navigation to `?step=`, which the page keeps at or before the saved position
  const handleSuccessComplete = () => {
    setShowSuccess(false)
    if (position !== "summary") router.push(`/setup?step=${nextStepId(position)}`)
  }

  const handleFinalSuccessComplete = async () => {
    // Mark setup as complete in the database
    await completeSetup()
    // Redirect to home page
    router.push("/")
  }

  const handleBack = () => {
    const previous = previousStepId(position)
    if (previous) router.push(`/setup?step=${previous}`)
  }

  const renderStep = () => {
    if (position === "summary") {
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

    switch (position) {
      case "plex":
        return <PlexServerForm devDefaults={devDefaults} onComplete={handleStepComplete} onBack={undefined} />
      case "tautulli":
        return <TautulliForm devDefaults={devDefaults} onComplete={handleStepComplete} onBack={handleBack} />
      case "overseerr":
        return <OverseerrForm devDefaults={devDefaults} onComplete={handleStepComplete} onBack={handleBack} />
      case "sonarr":
        return <SonarrForm devDefaults={devDefaults} onComplete={handleStepComplete} onBack={handleBack} />
      case "radarr":
        return <RadarrForm devDefaults={devDefaults} onComplete={handleStepComplete} onBack={handleBack} />
      case "llm-rewind":
        return <LLMProviderForm devDefaults={devDefaults} purpose="wrapped" onComplete={handleStepComplete} onBack={handleBack} />
      case "llm-chat":
        return <LLMProviderForm devDefaults={devDefaults} purpose="chat" onComplete={handleStepComplete} onBack={handleBack} />
      case "discord":
        return <DiscordIntegrationForm devDefaults={devDefaults} onComplete={handleStepComplete} onBack={handleBack} />
      case "prometheus":
        return <PrometheusForm devDefaults={devDefaults} onComplete={handleStepComplete} onBack={handleBack} />
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
              const isComplete = index + 1 < currentStep
              const isActive = index + 1 === currentStep
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
                        <Icon icon={icons.done} size={16} />
                      ) : (
                        index + 1
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

        {/* Dev Mode Banner */}
        <DevModeBanner devDefaults={devDefaults} />

        {/* Step Content: an opaque panel, so the drifting stars and nebulae
            behind it never change the colour its text sits on */}
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.4 }}
            className="bg-slate-900 border border-cyan-400/20 shadow-2xl rounded-lg p-6"
          >
            {renderStep()}
          </motion.div>
        </AnimatePresence>
        {isOptionalStep(position) && <SkipStepButton stepId={position} />}
      </div>
    </>
  )
}
