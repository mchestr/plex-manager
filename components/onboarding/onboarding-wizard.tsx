"use client"

import { completeOnboarding, getOnboardingInfo } from "@/actions/onboarding"
import { DiscordSupportStep, FinalStep, MediaRequestStep, PlexConfigurationStep, WelcomeStep } from "@/components/onboarding/onboarding-steps"
import { JellyfinConfigurationStep } from "@/components/onboarding/onboarding-steps/jellyfin-configuration-step"
import { JellyfinWelcomeStep } from "@/components/onboarding/onboarding-steps/jellyfin-welcome-step"
import { FinalSuccessAnimation } from "@/components/setup/setup-wizard/final-success-animation"
import { SuccessAnimation } from "@/components/setup/setup-wizard/success-animation"
import { useToast } from "@/components/ui/sonner"
import { type AuthService, getOnboardingSteps } from "@/types/onboarding"
import { AnimatePresence, motion } from "framer-motion"
import { useEffect, useState } from "react"

interface OnboardingWizardProps {
  currentStep: number
  service: AuthService
}

export function OnboardingWizard({ currentStep: initialStep, service }: OnboardingWizardProps) {
  const toast = useToast()
  const [currentStep, setCurrentStep] = useState(initialStep)
  const [showSuccess, setShowSuccess] = useState(false)
  const [showFinalSuccess, setShowFinalSuccess] = useState(false)
  const [overseerrUrl, setOverseerrUrl] = useState<string | null>(null)
  const [discordEnabled, setDiscordEnabled] = useState(false)
  const [discordInstructions, setDiscordInstructions] = useState<string | null>(null)

  const steps = getOnboardingSteps(service)

  useEffect(() => {
    const fetchInfo = async () => {
      const info = await getOnboardingInfo()
      setOverseerrUrl(info.overseerrUrl)
      setDiscordEnabled(info.discordEnabled ?? false)
      setDiscordInstructions(info.discordInstructions ?? null)
    }
    fetchInfo()
  }, [])

  const handleStepComplete = () => {
    const isFinalStep = currentStep === steps.length
    if (isFinalStep) {
      setShowFinalSuccess(true)
    } else if (currentStep < steps.length) {
      setShowSuccess(true)
    }
  }

  const handleSuccessComplete = () => {
    setShowSuccess(false)
    setCurrentStep(currentStep + 1)
  }

  const handleFinalSuccessComplete = async () => {
    // Mark onboarding as complete in the database for this service
    const result = await completeOnboarding(service)

    if (result.success) {
      // Wait a moment to ensure the database update is committed
      await new Promise(resolve => setTimeout(resolve, 500))

      // Use window.location for a full page reload to ensure session is refreshed
      // and the server-side redirect logic in app/page.tsx can properly check onboarding status
      window.location.href = "/"
    } else {
      console.error("Failed to complete onboarding:", result.error)
      setShowFinalSuccess(false)
      toast.showError(result.error || "Failed to complete onboarding. Please try again.")
    }
  }

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1)
    }
  }

  const getSuccessMessage = () => {
    const serviceName = service === "jellyfin" ? "Jellyfin" : "Plex"
    switch (currentStep) {
      case 1:
        return { title: "Welcome!", message: `Let's configure ${serviceName}` }
      case 2:
        return { title: "Great!", message: "Next: Media Requests" }
      case 3:
        return { title: "Got it!", message: "Next: Support" }
      case 4:
        return { title: "Perfect!", message: "You're all set" }
      default:
        return { title: "Success!", message: "Moving to next step" }
    }
  }

  const renderStep = () => {
    switch (currentStep) {
      case 1:
        return service === "jellyfin"
          ? <JellyfinWelcomeStep onComplete={handleStepComplete} />
          : <WelcomeStep onComplete={handleStepComplete} />
      case 2:
        return service === "jellyfin"
          ? <JellyfinConfigurationStep onComplete={handleStepComplete} onBack={handleBack} />
          : <PlexConfigurationStep onComplete={handleStepComplete} onBack={handleBack} />
      case 3:
        return <MediaRequestStep onComplete={handleStepComplete} onBack={handleBack} overseerrUrl={overseerrUrl} />
      case 4:
        return (
          <DiscordSupportStep
            onComplete={handleStepComplete}
            onBack={handleBack}
            discordEnabled={discordEnabled}
            instructions={discordInstructions}
          />
        )
      case 5:
        return <FinalStep onComplete={handleStepComplete} onBack={handleBack} />
      default:
        return <div className="text-white">Step {currentStep} - Coming soon</div>
    }
  }

  return (
    <>
      {/* Success Animation Overlay */}
      <AnimatePresence>
        {showSuccess && (
          <SuccessAnimation
            onComplete={handleSuccessComplete}
            title={getSuccessMessage().title}
            message={getSuccessMessage().message}
          />
        )}
        {showFinalSuccess && (
          <FinalSuccessAnimation
            onComplete={handleFinalSuccessComplete}
            title="Onboarding Complete!"
            subtitle="Enjoy the server!"
          />
        )}
      </AnimatePresence>

      <div className="max-w-3xl mx-auto relative z-10">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-8"
        >
          <h1 data-testid="onboarding-wizard-heading" className="text-4xl font-bold mb-2 drop-shadow-lg bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
            Welcome!
          </h1>
          <p data-testid="onboarding-wizard-subheading" className="text-slate-300 text-lg">Let's get you started</p>
        </motion.div>

        {/* Step Indicator */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="mb-8"
        >
          <nav aria-label="Progress">
            <ol role="list" className="flex items-center justify-between">
              {steps.map((step, index) => (
                <li
                  key={step.title}
                  className={`relative ${
                    index !== steps.length - 1 ? "pr-8 sm:pr-20 flex-1" : ""
                  }`}
                >
                  <div className="group flex flex-col items-center text-center">
                    <div className="relative flex items-center justify-center">
                      <div
                        className={`h-10 w-10 rounded-full flex items-center justify-center transition-all duration-300 ${
                          step.id <= currentStep
                            ? "bg-gradient-to-r from-cyan-500 to-purple-600 text-white shadow-lg shadow-cyan-500/20 scale-110"
                            : "bg-slate-800 border-2 border-slate-600 text-slate-400"
                        }`}
                      >
                        {step.id < currentStep ? (
                          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                        ) : (
                          <span className="text-sm font-bold">{step.id}</span>
                        )}
                      </div>

                      {/* Line connecting steps */}
                      {index !== steps.length - 1 && (
                        <div className="hidden sm:block absolute left-10 w-[calc(100%+4rem)] top-1/2 -translate-y-1/2 -z-10">
                          <div className="h-1 w-full bg-slate-800 rounded-full overflow-hidden">
                            <motion.div
                              initial={{ width: "0%" }}
                              animate={{
                                width: step.id < currentStep ? "100%" :
                                       step.id === currentStep ? "50%" : "0%"
                              }}
                              transition={{ duration: 0.5 }}
                              className="h-full bg-gradient-to-r from-cyan-500 to-purple-600"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="mt-2 min-w-0 hidden sm:block">
                      <p
                        className={`text-xs font-medium transition-colors ${
                          step.id <= currentStep
                            ? "text-white"
                            : "text-slate-400"
                        }`}
                      >
                        {step.title}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </nav>
        </motion.div>

        {/* Step Content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.4 }}
            className="bg-slate-900/90 border border-cyan-400/20 shadow-2xl rounded-lg p-6 relative overflow-hidden"
            style={{ backdropFilter: "blur(8px)" }}
          >
             {/* Background Gradient Mesh */}
             <div className="absolute top-0 right-0 -mr-20 -mt-20 w-64 h-64 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
             <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-64 h-64 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

             <div className="relative z-10">
              {renderStep()}
             </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </>
  )
}
