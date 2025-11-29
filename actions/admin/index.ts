/**
 * Admin actions
 *
 * This is a barrel file that re-exports all admin-related actions
 * from their domain-specific modules.
 */

// Config and wrapped settings
export {
  getConfig,
  setLLMDisabled,
  getWrappedSettings,
  updateWrappedSettings,
} from "./admin-config"

// LLM usage and providers
export {
  getLLMUsageRecords,
  getLLMUsageById,
  getLLMUsageStats,
  updateLLMProvider,
  updateChatLLMProvider,
  updateWrappedLLMProvider,
  getHistoricalWrappedVersions,
  getHistoricalWrappedData,
} from "./admin-llm"

// Server configurations
export {
  updatePlexServer,
  updateTautulli,
  updateOverseerr,
  updateSonarr,
  updateRadarr,
} from "./admin-servers"

// User management
export {
  getUserById,
  updateUserAdminStatus,
} from "./admin-users"

// Combined settings
export { getAdminSettings } from "./admin-settings"
