import { z } from "zod"

/**
 * Validates a cron expression pattern
 * Supports standard 5-field cron format: minute hour day month weekday
 * Example: "0 2 * * *" (daily at 2 AM)
 */
function isValidCronExpression(cron: string): boolean {
  // Standard 5-field cron: minute hour day-of-month month day-of-week
  // Each field can be: number, *, */n, n-m, or comma-separated values
  const fieldPatterns = [
    /^(\*|(\*\/[1-9]\d*)|([0-5]?\d)(,[0-5]?\d)*|([0-5]?\d-[0-5]?\d))$/, // minute (0-59)
    /^(\*|(\*\/[1-9]\d*)|(1?\d|2[0-3])(,(1?\d|2[0-3]))*|(1?\d|2[0-3])-(1?\d|2[0-3]))$/, // hour (0-23)
    /^(\*|(\*\/[1-9]\d*)|([1-9]|[12]\d|3[01])(,([1-9]|[12]\d|3[01]))*|([1-9]|[12]\d|3[01])-([1-9]|[12]\d|3[01]))$/, // day (1-31)
    /^(\*|(\*\/[1-9]\d*)|([1-9]|1[0-2])(,([1-9]|1[0-2]))*|([1-9]|1[0-2])-([1-9]|1[0-2]))$/, // month (1-12)
    /^(\*|(\*\/[1-9]\d*)|[0-6](,[0-6])*|[0-6]-[0-6])$/, // weekday (0-6, 0=Sunday)
  ]

  const fields = cron.trim().split(/\s+/)
  if (fields.length !== 5) {
    return false
  }

  return fields.every((field, index) => fieldPatterns[index].test(field))
}

// Cron schedule schema with validation
// Allows empty strings (treated as no schedule) or valid cron expressions
const CronScheduleSchema = z
  .string()
  .transform((val) => val.trim() || undefined) // Empty strings become undefined
  .refine((val) => val === undefined || isValidCronExpression(val), {
    message: "Invalid cron expression. Use 5-field format: minute hour day month weekday (e.g., '0 2 * * *' for daily at 2 AM)",
  })

// Enums matching Prisma schema
export const MediaTypeEnum = z.enum(["MOVIE", "TV_SERIES", "EPISODE"])

export const MarkTypeEnum = z.enum([
  "FINISHED_WATCHING",
  "NOT_INTERESTED",
  "KEEP_FOREVER",
  "REWATCH_CANDIDATE",
  "POOR_QUALITY",
  "WRONG_VERSION",
])

export const IntentTypeEnum = z.enum([
  "PLAN_TO_WATCH",
  "WATCHING",
  "COMPLETED",
  "DROPPED",
  "ON_HOLD",
])

export const ScanStatusEnum = z.enum([
  "PENDING",
  "RUNNING",
  "COMPLETED",
  "FAILED",
])

export const ReviewStatusEnum = z.enum([
  "PENDING",
  "APPROVED",
  "REJECTED",
  "DELETED",
])

export const ActionTypeEnum = z.enum([
  "FLAG_FOR_REVIEW",
  "AUTO_DELETE",
  "UNMONITOR_AND_DELETE",
  "UNMONITOR_AND_KEEP",
  "DO_NOTHING",
])

// Hierarchical rule criteria schema
// Condition value schema (can be string, number, boolean, array, or null)
const ConditionValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.string()),
  z.array(z.number()),
  z.null(),
])

// Base condition schema (atomic leaf node in rule tree)
export const ConditionSchema = z.object({
  type: z.literal('condition'),
  id: z.string(),
  field: z.string(), // Field key from field registry
  operator: z.string(), // Operator validated at runtime against field's allowedOperators
  value: ConditionValueSchema,
  valueUnit: z.enum(['days', 'months', 'years', 'MB', 'GB', 'TB']).optional(),
})

// Condition group schema (branch node that can contain conditions or other groups)
export const ConditionGroupSchema: z.ZodType<ConditionGroup> = z.lazy(() =>
  z.object({
    type: z.literal('group'),
    id: z.string(),
    operator: z.enum(['AND', 'OR']),
    conditions: z.array(z.union([ConditionSchema, ConditionGroupSchema])).min(1, "Group must have at least one condition"),
  })
)

// Root criteria is always a condition group
export const RuleCriteriaSchema = ConditionGroupSchema

// Legacy criteria schema for backwards compatibility
export const LegacyRuleCriteriaSchema = z.object({
  neverWatched: z.boolean().optional(),
  lastWatchedBefore: z
    .object({
      value: z.number().min(1),
      unit: z.enum(["days", "months", "years"]),
    })
    .optional(),
  maxPlayCount: z.number().min(0).optional(),
  addedBefore: z
    .object({
      value: z.number().min(1),
      unit: z.enum(["days", "months", "years"]),
    })
    .optional(),
  minFileSize: z
    .object({
      value: z.number().min(0),
      unit: z.enum(["MB", "GB", "TB"]),
    })
    .optional(),
  maxQuality: z.string().optional(),
  maxRating: z.number().min(0).max(10).optional(),
  libraryIds: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  operator: z.enum(["AND", "OR"]).default("AND"),
})

// Maintenance rule schemas
export const CreateMaintenanceRuleSchema = z.object({
  name: z.string().min(1, "Rule name is required"),
  description: z.string().optional(),
  enabled: z.boolean().default(true),
  mediaType: MediaTypeEnum,
  criteria: RuleCriteriaSchema,
  actionType: ActionTypeEnum,
  actionDelayDays: z.number().int().min(0).optional(),
  radarrId: z.string().optional(),
  sonarrId: z.string().optional(),
  schedule: CronScheduleSchema.optional(),
})

export const UpdateMaintenanceRuleSchema = z.object({
  name: z.string().min(1, "Rule name is required").optional(),
  description: z.string().optional(),
  enabled: z.boolean().optional(),
  mediaType: MediaTypeEnum.optional(),
  criteria: RuleCriteriaSchema.optional(),
  actionType: ActionTypeEnum.optional(),
  actionDelayDays: z.number().int().min(0).optional(),
  radarrId: z.string().optional(),
  sonarrId: z.string().optional(),
  schedule: CronScheduleSchema.optional().nullable(),
})

// User media mark schemas
export const CreateUserMediaMarkSchema = z.object({
  mediaType: MediaTypeEnum,
  plexRatingKey: z.string().min(1, "Plex rating key is required"),
  radarrId: z.number().optional(),
  sonarrId: z.number().optional(),
  title: z.string().min(1, "Title is required"),
  year: z.number().optional(),
  seasonNumber: z.number().optional(),
  episodeNumber: z.number().optional(),
  parentTitle: z.string().optional(),
  markType: MarkTypeEnum,
  note: z.string().optional(),
  markedVia: z.string().default("web"),
  discordChannelId: z.string().optional(),
})

// User watch intent schemas
export const CreateUserWatchIntentSchema = z.object({
  plexRatingKey: z.string().min(1, "Plex rating key is required"),
  mediaType: MediaTypeEnum,
  title: z.string().min(1, "Title is required"),
  intentType: IntentTypeEnum,
  priority: z.number().default(0),
  currentSeason: z.number().optional(),
  currentEpisode: z.number().optional(),
})

// Hierarchical rule type definitions (explicit types for recursive structure)
export interface Condition {
  type: 'condition'
  id: string
  field: string
  operator: string
  value: string | number | boolean | string[] | number[] | null
  valueUnit?: 'days' | 'months' | 'years' | 'MB' | 'GB' | 'TB'
}

export interface ConditionGroup {
  type: 'group'
  id: string
  operator: 'AND' | 'OR'
  conditions: Array<Condition | ConditionGroup>
}

// Type exports
export type MediaType = z.infer<typeof MediaTypeEnum>
export type MarkType = z.infer<typeof MarkTypeEnum>
export type IntentType = z.infer<typeof IntentTypeEnum>
export type ScanStatus = z.infer<typeof ScanStatusEnum>
export type ReviewStatus = z.infer<typeof ReviewStatusEnum>
export type ActionType = z.infer<typeof ActionTypeEnum>

export type RuleCriteria = ConditionGroup // Root is always a group
export type LegacyRuleCriteria = z.infer<typeof LegacyRuleCriteriaSchema>
export type CreateMaintenanceRule = z.infer<typeof CreateMaintenanceRuleSchema>
export type UpdateMaintenanceRule = z.infer<typeof UpdateMaintenanceRuleSchema>
export type CreateUserMediaMark = z.infer<typeof CreateUserMediaMarkSchema>
export type CreateUserWatchIntent = z.infer<typeof CreateUserWatchIntentSchema>

// Pagination schema for candidate listing
export const CandidatePaginationSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(25),
  reviewStatus: ReviewStatusEnum.optional(),
  mediaType: MediaTypeEnum.optional(),
  scanId: z.string().optional(),
})

export type CandidatePagination = z.infer<typeof CandidatePaginationSchema>

/**
 * Runtime validation for rule criteria
 * Validates field/operator compatibility and media type constraints
 */
export function validateRuleCriteria(
  criteria: RuleCriteria,
  mediaType: MediaType
): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  // Import field registry dynamically to avoid circular dependencies
  const { FIELD_DEFINITIONS } = require('@/lib/maintenance/field-registry') as { FIELD_DEFINITIONS: import('@/lib/maintenance/field-registry').FieldDefinition[] }

  function validateNode(node: Condition | ConditionGroup, path = 'root'): void {
    if (node.type === 'condition') {
      const fieldDef = FIELD_DEFINITIONS.find((f) => f.key === node.field)

      if (!fieldDef) {
        errors.push(`${path}: Unknown field "${node.field}"`)
        return
      }

      if (!fieldDef.mediaTypes.includes(mediaType)) {
        errors.push(
          `${path}: Field "${node.field}" not available for media type ${mediaType}`
        )
      }

      if (!(fieldDef.allowedOperators as string[]).includes(node.operator)) {
        errors.push(
          `${path}: Operator "${node.operator}" not allowed for field "${node.field}"`
        )
      }

      // Type-specific value validation
      if (node.value !== null && node.value !== undefined) {
        if (fieldDef.type === 'number' && typeof node.value !== 'number') {
          errors.push(`${path}: Field "${node.field}" expects a number value`)
        }
        if (fieldDef.type === 'boolean' && typeof node.value !== 'boolean') {
          errors.push(`${path}: Field "${node.field}" expects a boolean value`)
        }
        if (fieldDef.type === 'array' && !Array.isArray(node.value)) {
          errors.push(`${path}: Field "${node.field}" expects an array value`)
        }
      }
    } else {
      // Validate group
      if (node.conditions.length === 0) {
        errors.push(`${path}: Condition group must have at least one condition`)
      }

      node.conditions.forEach((child, index) => {
        validateNode(child, `${path}.conditions[${index}]`)
      })
    }
  }

  validateNode(criteria)

  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * Migrate legacy flat rule criteria to hierarchical format
 */
export function migrateLegacyRuleCriteria(legacy: LegacyRuleCriteria): RuleCriteria {
  const { generateId } = require('@/lib/maintenance/field-registry')
  const conditions: Array<Condition | ConditionGroup> = []

  if (legacy.neverWatched !== undefined) {
    conditions.push({
      type: 'condition',
      id: generateId(),
      field: 'neverWatched',
      operator: 'equals',
      value: legacy.neverWatched,
    })
  }

  if (legacy.lastWatchedBefore) {
    conditions.push({
      type: 'condition',
      id: generateId(),
      field: 'lastWatchedAt',
      operator: 'olderThan',
      value: legacy.lastWatchedBefore.value,
      valueUnit: legacy.lastWatchedBefore.unit,
    })
  }

  if (legacy.maxPlayCount !== undefined) {
    conditions.push({
      type: 'condition',
      id: generateId(),
      field: 'playCount',
      operator: 'lessThanOrEqual',
      value: legacy.maxPlayCount,
    })
  }

  if (legacy.addedBefore) {
    conditions.push({
      type: 'condition',
      id: generateId(),
      field: 'addedAt',
      operator: 'olderThan',
      value: legacy.addedBefore.value,
      valueUnit: legacy.addedBefore.unit,
    })
  }

  if (legacy.minFileSize) {
    // Convert to bytes
    let bytes = legacy.minFileSize.value
    if (legacy.minFileSize.unit === 'GB') bytes *= 1024 * 1024 * 1024
    else if (legacy.minFileSize.unit === 'TB') bytes *= 1024 * 1024 * 1024 * 1024
    else bytes *= 1024 * 1024 // MB

    conditions.push({
      type: 'condition',
      id: generateId(),
      field: 'fileSize',
      operator: 'greaterThanOrEqual',
      value: bytes,
    })
  }

  if (legacy.maxQuality) {
    // For maxQuality, we need to check if resolution is <= maxQuality alphabetically
    // Since resolution is an enum, we'll use a custom approach: check if resolution equals or is in a list
    // For now, we'll use 'in' operator with all values <= maxQuality
    // This is a simplified approach - in practice, you'd need to know all enum values
    conditions.push({
      type: 'condition',
      id: generateId(),
      field: 'resolution',
      operator: 'lessThanOrEqual', // This will be handled specially for enum/string comparison
      value: legacy.maxQuality,
    })
  }

  if (legacy.maxRating !== undefined) {
    conditions.push({
      type: 'condition',
      id: generateId(),
      field: 'rating',
      operator: 'lessThanOrEqual',
      value: legacy.maxRating,
    })
  }

  if (legacy.libraryIds && legacy.libraryIds.length > 0) {
    conditions.push({
      type: 'condition',
      id: generateId(),
      field: 'libraryId',
      operator: 'in',
      value: legacy.libraryIds,
    })
  }

  if (legacy.tags && legacy.tags.length > 0) {
    conditions.push({
      type: 'condition',
      id: generateId(),
      field: 'labels',
      operator: 'containsAny',
      value: legacy.tags,
    })
  }

  // If no conditions, create a default "never watched" condition
  if (conditions.length === 0) {
    conditions.push({
      type: 'condition',
      id: generateId(),
      field: 'neverWatched',
      operator: 'equals',
      value: true,
    })
  }

  return {
    type: 'group',
    id: generateId(),
    operator: legacy.operator || 'AND',
    conditions,
  }
}
