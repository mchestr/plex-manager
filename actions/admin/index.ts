/**
 * Admin actions
 *
 * The one entry point for admin actions: it re-exports them from their
 * domain-specific modules.
 */

// Config and wrapped settings
export {
  setLLMDisabled,
  getWrappedSettings,
  updateLlmCaps,
  updateServerTimeZone,
} from "./admin-config"

// LLM usage and providers
export {
  getLLMUsageRecords,
  getLLMUsageById,
} from "./admin-llm-usage"

export {
  listLLMModels,
  updateChatLLMProvider,
  updateWrappedLLMProvider,
} from "./admin-llm-providers"

// Server configurations
export {
  updatePlexServer,
  updateJellyfinServer,
  updateTautulli,
  updateOverseerr,
  updateSonarr,
  updateRadarr,
  updatePrometheus,
} from "./admin-servers"

// User management
export {
  updateUserAdminStatus,
  setUserDisabled,
} from "./admin-users"

// Combined settings
export { getAdminSettings } from "./admin-settings"
