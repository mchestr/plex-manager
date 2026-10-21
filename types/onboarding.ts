export type AuthService = "plex" | "jellyfin"

/** The onboarding steps (ui-design-system 6.5); `final` is the Done step. */
export type OnboardingStepId = "welcome" | "playback" | "requests" | "support" | "final"

export interface OnboardingStep {
  id: OnboardingStepId
  label: string
}

const ONBOARDING_STEPS: readonly OnboardingStep[] = [
  { id: "welcome", label: "Welcome" },
  { id: "playback", label: "Playback" },
  { id: "requests", label: "Requests" },
  { id: "support", label: "Support" },
  { id: "final", label: "Done" },
]

/** The member's steps: Requests only when the request site has a public URL. */
export function getOnboardingSteps({ hasRequests }: { hasRequests: boolean }): OnboardingStep[] {
  return ONBOARDING_STEPS.filter((step) => hasRequests || step.id !== "requests")
}
