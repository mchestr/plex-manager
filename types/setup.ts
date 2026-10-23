/**
 * The first-run setup wizard's steps (P10.24, design 6.5): string ids in the
 * grouped order, so a stored position survives a reorder. Only Plex and
 * Tautulli are required; every other step can be skipped. The wizard's
 * position is a step id, or `summary` once every step is saved or skipped.
 */

const SETUP_STEP_IDS = [
  "plex",
  "tautulli",
  "overseerr",
  "sonarr",
  "radarr",
  "llm-rewind",
  "llm-chat",
  "discord",
  "prometheus",
] as const

export type SetupStepId = (typeof SETUP_STEP_IDS)[number]

/** Where the wizard is: a step, or the summary after the last one. */
export type SetupPosition = SetupStepId | "summary"

type SetupStepGroup = "Core" | "Requests" | "Automation" | "AI" | "Community and monitoring"

export interface SetupStep {
  id: SetupStepId
  title: string
  description: string
  group: SetupStepGroup
  /** False only for Plex and Tautulli; an optional step offers Skip for now. */
  optional: boolean
}

export const SETUP_STEPS: readonly SetupStep[] = [
  { id: "plex", title: "Plex server", description: "Connect your Plex server", group: "Core", optional: false },
  { id: "tautulli", title: "Tautulli", description: "Connect Tautulli for watch history", group: "Core", optional: false },
  { id: "overseerr", title: "Overseerr", description: "Connect Overseerr for requests", group: "Requests", optional: true },
  { id: "sonarr", title: "Sonarr", description: "Connect Sonarr for series", group: "Automation", optional: true },
  { id: "radarr", title: "Radarr", description: "Connect Radarr for movies", group: "Automation", optional: true },
  { id: "llm-rewind", title: "Rewind writer", description: "The AI provider that writes each Rewind", group: "AI", optional: true },
  { id: "llm-chat", title: "Admin assistant", description: "The AI provider for the admin assistant", group: "AI", optional: true },
  { id: "discord", title: "Discord", description: "Linked roles and the Discord bot", group: "Community and monitoring", optional: true },
  { id: "prometheus", title: "Prometheus", description: "Server status from Prometheus", group: "Community and monitoring", optional: true },
]

/** The ids Skip for now accepts: every step but Plex and Tautulli. */
export const OPTIONAL_SETUP_STEP_IDS = [
  "overseerr",
  "sonarr",
  "radarr",
  "llm-rewind",
  "llm-chat",
  "discord",
  "prometheus",
] as const satisfies readonly SetupStepId[]

export type OptionalSetupStepId = (typeof OPTIONAL_SETUP_STEP_IDS)[number]

/** Whether `position` is a step Skip for now accepts. */
export function isOptionalStep(position: SetupPosition): position is OptionalSetupStepId {
  return OPTIONAL_SETUP_STEP_IDS.some((id) => id === position)
}

/** A position's index: 0 for Plex up to `SETUP_STEPS.length` for the summary. */
export function stepIndex(position: SetupPosition): number {
  return position === "summary" ? SETUP_STEP_IDS.length : SETUP_STEP_IDS.indexOf(position)
}

/** The position after `id`: the next step, or the summary after the last. */
export function nextStepId(id: SetupStepId): SetupPosition {
  return SETUP_STEP_IDS[stepIndex(id) + 1] ?? "summary"
}

/** The step before `position`, or null on the first. */
export function previousStepId(position: SetupPosition): SetupStepId | null {
  return SETUP_STEP_IDS[stepIndex(position) - 1] ?? null
}

/** `value` as a position, or null when it names none (a stored or `?step=` value). */
export function parseSetupPosition(value: unknown): SetupPosition | null {
  if (value === "summary") return value
  return SETUP_STEP_IDS.find((id) => id === value) ?? null
}

// The setup wizard's DEV_* pre-fill, read by lib/setup/dev-defaults.ts
export interface ServiceDefaults {
  name?: string
  url?: string
  token?: string
  apiKey?: string
  publicUrl?: string
}

export interface LLMDefaults {
  provider?: "openai"
  apiKey?: string
  model?: string
  temperature?: number
  maxTokens?: number
}

export interface DiscordDefaults {
  isEnabled?: boolean
  botEnabled?: boolean
  clientId?: string
  clientSecret?: string
  guildId?: string
  serverInviteCode?: string
  platformName?: string
  instructions?: string
}

export interface PrometheusDefaults {
  name?: string
  url?: string
  query?: string
}

export interface DevDefaults {
  plex: ServiceDefaults | null
  tautulli: ServiceDefaults | null
  overseerr: ServiceDefaults | null
  sonarr: ServiceDefaults | null
  radarr: ServiceDefaults | null
  discord: DiscordDefaults | null
  prometheus: PrometheusDefaults | null
  chatLlmProvider: LLMDefaults | null
  wrappedLlmProvider: LLMDefaults | null
  /** @deprecated Use chatLlmProvider or wrappedLlmProvider instead */
  llmProvider: LLMDefaults | null
  /** Whether any DEV_* variables are actively providing defaults */
  isDevMode: boolean
  /** Whether auto-submit is enabled for fully populated forms */
  autoSubmit: boolean
}
