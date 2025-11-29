/**
 * Maintenance actions module
 *
 * This module has been split into separate files for better organization:
 * - rules.ts: Rule CRUD operations
 * - candidates.ts: Candidate management
 * - operations.ts: Scan and deletion triggers
 * - user-marks.ts: User media marks
 * - stats.ts: Statistics and history
 */

// Rule management
export {
  getMaintenanceRules,
  createMaintenanceRule,
  updateMaintenanceRule,
  deleteMaintenanceRule,
  toggleMaintenanceRule,
} from "./rules"

// Candidate management
export {
  getMaintenanceCandidates,
  updateCandidateReviewStatus,
  bulkUpdateCandidates,
} from "./candidates"

// Scan and deletion operations
export {
  triggerManualScan,
  triggerDeletion,
} from "./operations"

// User media marks
export {
  getUserMediaMarks,
  createUserMediaMark,
  deleteUserMediaMark,
} from "./user-marks"

// Statistics and history
export {
  getMaintenanceStats,
  getDeletionHistory,
  getDeletionStats,
} from "./stats"
