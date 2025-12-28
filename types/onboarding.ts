export interface OnboardingStep {
  id: number
  title: string
  description: string
}

export type AuthService = "plex" | "jellyfin"

export const PLEX_ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: 1,
    title: "Welcome",
    description: "How it works",
  },
  {
    id: 2,
    title: "Configuration",
    description: "Optimize Plex settings",
  },
  {
    id: 3,
    title: "Requests",
    description: "Request new media",
  },
  {
    id: 4,
    title: "Support",
    description: "Get help & join community",
  },
  {
    id: 5,
    title: "All Set!",
    description: "Start exploring",
  },
]

export const JELLYFIN_ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: 1,
    title: "Welcome",
    description: "How it works",
  },
  {
    id: 2,
    title: "Configuration",
    description: "Optimize Jellyfin settings",
  },
  {
    id: 3,
    title: "Requests",
    description: "Request new media",
  },
  {
    id: 4,
    title: "Support",
    description: "Get help & join community",
  },
  {
    id: 5,
    title: "All Set!",
    description: "Start exploring",
  },
]

// Legacy export for backward compatibility
export const ONBOARDING_STEPS = PLEX_ONBOARDING_STEPS

export function getOnboardingSteps(service: AuthService): OnboardingStep[] {
  return service === "jellyfin" ? JELLYFIN_ONBOARDING_STEPS : PLEX_ONBOARDING_STEPS
}

