/**
 * Discord Command Audit Logging Service
 *
 * Provides functions to log all Discord bot interactions to the database
 * for monitoring, analytics, and debugging purposes.
 *
 * This barrel re-exports the write path and every metric reader from their
 * focused modules under `./`. Import from here (or the `@/lib/discord/audit`
 * shim) to keep call sites stable.
 */

export {
  createCommandLog,
  updateCommandLog,
  logCommandExecution,
  type CreateCommandLogParams,
  type UpdateCommandLogParams,
} from "./write"

export {
  getCommandLogs,
  type GetCommandLogsParams,
  type GetCommandLogsResult,
} from "./logs"

export {
  getDailyActivity,
  getSummaryStats,
  type DailyActivity,
  type SummaryStats,
} from "./metrics/activity"

export {
  getCommandStats,
  getMediaMarkingBreakdown,
  getContextMetrics,
  type CommandStats,
  type MediaMarkingBreakdown,
  type ContextMetrics,
} from "./metrics/commands"

export {
  getActiveUsers,
  getAccountLinkingMetrics,
  type ActiveUser,
  type AccountLinkingMetrics,
} from "./metrics/users"

export {
  getErrorAnalysis,
  getSelectionMenuStats,
  getHelpCommandStats,
  type ErrorAnalysis,
  type SelectionMenuStats,
  type HelpCommandStats,
} from "./metrics/errors"
