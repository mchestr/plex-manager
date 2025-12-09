export interface SetupStep {
  id: number
  title: string
  description: string
}

export const SETUP_STEPS: SetupStep[] = [
  {
    id: 1,
    title: "Plex Server",
    description: "Configure your Plex server connection",
  },
  {
    id: 2,
    title: "Tautulli",
    description: "Configure your Tautulli API connection",
  },
  {
    id: 3,
    title: "Overseerr",
    description: "Configure your Overseerr API connection",
  },
  {
    id: 4,
    title: "Sonarr",
    description: "Configure your Sonarr API connection",
  },
  {
    id: 5,
    title: "Radarr",
    description: "Configure your Radarr API connection",
  },
  {
    id: 6,
    title: "Discord Linked Roles",
    description: "Connect your Discord application and linked roles metadata",
  },
  {
    id: 7,
    title: "Chat Assistant AI",
    description: "Configure the chatbot model used for admin troubleshooting",
  },
  {
    id: 8,
    title: "Wrapped AI Provider",
    description: "Configure OpenAI for Plex Wrapped generation",
  },
  {
    id: 9,
    title: "Prometheus Status",
    description: "Configure status monitoring with Prometheus",
  },
]

