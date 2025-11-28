import type { MediaType, ReviewStatus, ScanStatus } from "@/lib/validations/maintenance"

/**
 * Simplified maintenance candidate type used in candidate list views
 */
export interface MaintenanceCandidate {
  id: string
  mediaType: string
  plexRatingKey: string
  title: string
  year: number | null
  poster: string | null
  fileSize: bigint | null
  playCount: number
  lastWatchedAt: Date | null
  addedAt: Date | null
  reviewStatus: ReviewStatus
  flaggedAt: Date
  scan: {
    id: string
    rule: {
      id: string
      name: string
      actionType: string
    }
  }
}

/**
 * Rule criteria structure matching the Zod schema
 */
export interface RuleCriteria {
  neverWatched?: boolean
  lastWatchedBefore?: {
    value: number
    unit: "days" | "months" | "years"
  }
  maxPlayCount?: number
  addedBefore?: {
    value: number
    unit: "days" | "months" | "years"
  }
  minFileSize?: {
    value: number
    unit: "MB" | "GB" | "TB"
  }
  maxQuality?: string
  maxRating?: number
  libraryIds?: string[]
  tags?: string[]
  operator: "AND" | "OR"
}

/**
 * Aggregated user feedback data for a media item
 */
export interface UserFeedbackData {
  finishedMarks: number
  notInterestedMarks: number
  keepMarks: number
  rewatchMarks: number
  poorQualityMarks: number
  totalUniqueUsers: number
}

/**
 * Result of evaluating a rule against a media item
 */
export interface EvaluationResult {
  matches: boolean
  score: number
  reasons: string[]
}

/**
 * Media item interface for rule evaluation and display
 */
export interface MediaItem {
  plexRatingKey: string
  title: string
  year?: number
  libraryId?: string
  playCount: number
  lastWatchedAt?: Date | null
  addedAt?: Date | null
  fileSize?: bigint | null
  filePath?: string | null
  quality?: string | null
  rating?: number | null
  tags?: string[]
}

/**
 * Result of a maintenance scan operation
 */
export interface ScanResult {
  scanId: string
  status: "COMPLETED" | "FAILED"
  itemsScanned: number
  itemsFlagged: number
  error?: string
}

/**
 * Result of a deletion operation
 */
export interface DeletionResult {
  success: number
  failed: number
  errors: string[]
}

/**
 * Statistics for the maintenance dashboard
 */
export interface MaintenanceStats {
  totalRules: number
  activeRules: number
  totalCandidates: number
  candidatesByStatus: {
    pending: number
    approved: number
    rejected: number
    deleted: number
  }
  recentScans: Array<{
    id: string
    ruleId: string
    ruleName: string
    status: ScanStatus
    itemsScanned: number
    itemsFlagged: number
    completedAt: Date | null
  }>
  totalDeletions: number
  potentialSpaceSavings: bigint
}

/**
 * Maintenance candidate with scan and rule details
 */
export interface CandidateWithDetails {
  id: string
  scanId: string
  mediaType: MediaType
  plexRatingKey: string
  radarrId: number | null
  sonarrId: number | null
  tmdbId: number | null
  tvdbId: number | null
  title: string
  year: number | null
  poster: string | null
  filePath: string | null
  fileSize: bigint | null
  playCount: number
  lastWatchedAt: Date | null
  addedAt: Date | null
  matchedRules: unknown
  flaggedAt: Date
  reviewStatus: ReviewStatus
  reviewedAt: Date | null
  reviewedBy: string | null
  reviewNote: string | null
  deletedAt: Date | null
  deletionError: string | null
  createdAt: Date
  updatedAt: Date
  scan: {
    id: string
    ruleId: string
    rule: {
      id: string
      name: string
      description: string | null
      enabled: boolean
      mediaType: MediaType
      criteria: unknown
      actionType: "FLAG_FOR_REVIEW" | "AUTO_DELETE"
    }
  }
}

/**
 * Filters for querying maintenance candidates
 */
export interface CandidateFilters {
  scanId?: string
  mediaType?: MediaType
  reviewStatus?: ReviewStatus
  minFileSize?: number
  maxFileSize?: number
}

/**
 * Maintenance rule with scan statistics
 */
export interface RuleWithStats {
  id: string
  name: string
  description: string | null
  enabled: boolean
  mediaType: MediaType
  criteria: unknown
  actionType: "FLAG_FOR_REVIEW" | "AUTO_DELETE"
  schedule: string | null
  lastRunAt: Date | null
  nextRunAt: Date | null
  createdAt: Date
  updatedAt: Date
  scans: Array<{
    id: string
    status: ScanStatus
    itemsScanned: number
    itemsFlagged: number
    completedAt: Date | null
  }>
  _count: {
    scans: number
  }
}
