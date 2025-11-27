export interface OnboardingStep {
  id: number
  title: string
  description: string
}

export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: 1,
    title: "Welcome",
    description: "How Plex Wrapped works",
  },
  {
    id: 2,
    title: "Configuration",
    description: "Optimize your experience",
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

