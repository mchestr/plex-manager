/**
 * Discord Command Audit Logging Service
 *
 * Provides functions to log all Discord bot interactions to the database
 * for monitoring, analytics, and debugging purposes.
 *
 * This barrel re-exports the write path and every metric reader from their
 * focused modules under `./`. Import from here to keep call sites stable.
 */

export {
  createCommandLog,
  updateCommandLog,
  type CreateCommandLogParams,
} from "./write"

export {
  getCommandLogs,
  type GetCommandLogsParams,
} from "./logs"

export {
  getDailyActivity,
  getSummaryStats,
} from "./metrics/activity"

export {
  getCommandStats,
  getMediaMarkingBreakdown,
  getContextMetrics,
} from "./metrics/commands"

export {
  getActiveUsers,
  getAccountLinkingMetrics,
} from "./metrics/users"

export {
  getErrorAnalysis,
  getSelectionMenuStats,
  getHelpCommandStats,
} from "./metrics/errors"
