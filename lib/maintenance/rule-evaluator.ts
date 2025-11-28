/**
 * Enhanced Rule Evaluator with Hierarchical Support
 *
 * Evaluates maintenance rules against media items using a recursive tree-based approach.
 * Supports nested AND/OR groups and comprehensive field comparisons.
 *
 * ## Evaluation Algorithm
 *
 * The evaluator uses a recursive tree traversal approach:
 *
 * 1. **Node Type Check**: Each node is either a `condition` or a `group`
 * 2. **Condition Evaluation**: Single conditions compare field values using operators
 * 3. **Group Evaluation**: Groups recursively evaluate children and combine with AND/OR
 *
 * ```
 *          GROUP (AND)
 *         /    |     \
 *    cond1  cond2   GROUP (OR)
 *                   /        \
 *               cond3      cond4
 * ```
 *
 * For the above tree:
 * - First, cond3 and cond4 are evaluated and combined with OR
 * - Then cond1, cond2, and the OR result are combined with AND
 *
 * ## Type-Specific Comparisons
 *
 * Different field types support different operators:
 * - **String**: equals, contains, startsWith, endsWith, regex, in/notIn
 * - **Number**: equals, greaterThan, lessThan, between
 * - **Date**: before, after, olderThan, newerThan, between
 * - **Boolean**: equals, notEquals
 * - **Array**: contains, containsAny, containsAll, isEmpty
 *
 * ## Special Cases
 *
 * - **Null handling**: `null` and `notNull` operators check for presence
 * - **Never watched**: `lastWatchedAt` with `olderThan` returns true for null (never watched)
 * - **Legacy format**: Auto-migrates old flat criteria format to hierarchical
 *
 * @module lib/maintenance/rule-evaluator
 */

import type { RuleCriteria, Condition, ConditionGroup } from "@/lib/validations/maintenance"
import type {
  StringOperator,
  NumberOperator,
  DateOperator,
  BooleanOperator,
  ArrayOperator,
} from "./field-registry"
import { FIELD_DEFINITIONS } from "./field-registry"

/**
 * Extended media item interface for rule evaluation.
 *
 * Combines data from multiple sources (Plex, Tautulli, Radarr, Sonarr) into
 * a unified interface for rule evaluation. All fields are optional except
 * for the core identification and playback fields.
 *
 * ## Field Sources
 *
 * - **Plex**: Core metadata (title, year, rating, genres)
 * - **Tautulli**: Playback statistics (playCount, lastWatchedAt)
 * - **Radarr**: Movie management data (hasFile, monitored, quality)
 * - **Sonarr**: TV series management data (status, episodeFileCount)
 *
 * @example
 * ```ts
 * const item: MediaItem = {
 *   plexRatingKey: "12345",
 *   title: "Example Movie",
 *   year: 2020,
 *   playCount: 0,
 *   lastWatchedAt: null,
 *   fileSize: BigInt(1500000000),
 *   radarr: {
 *     hasFile: true,
 *     monitored: false
 *   }
 * }
 * ```
 */
export interface MediaItem {
  // ─── Core Identification ───────────────────────────────────────────────

  /** Unique Plex rating key identifying this media item */
  plexRatingKey: string
  /** Display title of the media */
  title: string
  /** Release year */
  year?: number
  /** ID of the Plex library containing this item */
  libraryId?: string

  // ─── Playback Statistics ───────────────────────────────────────────────

  /** Total number of times this item has been played */
  playCount: number
  /** Date/time of last playback, null if never watched */
  lastWatchedAt?: Date | null
  /** Date/time when item was added to library */
  addedAt?: Date | null

  // ─── File Information ──────────────────────────────────────────────────

  /** Total file size in bytes (BigInt for large files) */
  fileSize?: bigint | null
  /** Full path to the media file on disk */
  filePath?: string | null
  /** Duration in seconds */
  duration?: number | null

  // ─── Quality/Technical ─────────────────────────────────────────────────

  /** Video resolution (e.g., "1080p", "4K") */
  resolution?: string | null
  /** Video codec (e.g., "h264", "hevc") */
  videoCodec?: string | null
  /** Primary audio codec (e.g., "aac", "ac3") */
  audioCodec?: string | null
  /** Container format (e.g., "mkv", "mp4") */
  container?: string | null
  /** Video bitrate in kbps */
  bitrate?: number | null

  // ─── Metadata ──────────────────────────────────────────────────────────

  /** Plex/TMDB rating (0-10 scale) */
  rating?: number | null
  /** Audience rating (0-10 scale) */
  audienceRating?: number | null
  /** Content rating (e.g., "PG-13", "TV-MA") */
  contentRating?: string | null
  /** Genre tags */
  genres?: string[]
  /** User-assigned labels */
  labels?: string[]

  // ─── External Service Data ─────────────────────────────────────────────

  /** Radarr integration data for movies */
  radarr?: {
    /** Whether Radarr has a file for this movie */
    hasFile?: boolean
    /** Whether the movie is being monitored for upgrades */
    monitored?: boolean
    /** Quality profile ID in Radarr */
    qualityProfileId?: number
    /** Minimum availability setting */
    minimumAvailability?: string
  }

  /** Sonarr integration data for TV series */
  sonarr?: {
    /** Whether the series is being monitored */
    monitored?: boolean
    /** Series status (continuing, ended, etc.) */
    status?: string
    /** Number of episode files on disk */
    episodeFileCount?: number
    /** Percentage of episodes with files */
    percentOfEpisodes?: number
  }
}

/**
 * Main entry point for rule evaluation.
 *
 * Evaluates hierarchical rule criteria against a media item to determine
 * if the item matches the rule. Supports both the new hierarchical format
 * and legacy flat format (auto-migrates on first use).
 *
 * ## Evaluation Flow
 *
 * 1. Check for legacy format and migrate if needed
 * 2. Recursively evaluate the criteria tree via `evaluateNode`
 * 3. Return final boolean result
 *
 * ## Legacy Format Detection
 *
 * Legacy format is detected by checking for `type` property. New format
 * always has `type: 'group'` at the root. Legacy format had flat properties
 * like `neverWatched`, `maxPlayCount`, etc.
 *
 * @param item - The media item to evaluate against the rule
 * @param criteria - The rule criteria (hierarchical or legacy format)
 * @returns `true` if the item matches all criteria, `false` otherwise
 *
 * @example
 * ```ts
 * const criteria: RuleCriteria = {
 *   type: 'group',
 *   operator: 'AND',
 *   conditions: [
 *     { type: 'condition', field: 'playCount', operator: 'equals', value: 0 },
 *     { type: 'condition', field: 'addedAt', operator: 'olderThan', value: 365, valueUnit: 'days' }
 *   ]
 * }
 *
 * const matches = evaluateRule(mediaItem, criteria)
 * if (matches) {
 *   console.log('Item matches maintenance rule')
 * }
 * ```
 */
export function evaluateRule(item: MediaItem, criteria: RuleCriteria | any): boolean {
  // Check if this is legacy format (has properties like neverWatched, maxPlayCount, etc.)
  if (criteria && typeof criteria === 'object' && !criteria.type) {
    // Legacy format detected - migrate it
    const { migrateLegacyRuleCriteria } = require('@/lib/validations/maintenance')
    criteria = migrateLegacyRuleCriteria(criteria)
  }

  return evaluateNode(item, criteria)
}

/**
 * Recursively evaluates a node in the criteria tree.
 *
 * Handles both leaf nodes (conditions) and branch nodes (groups):
 * - **Conditions**: Evaluated directly via `evaluateCondition`
 * - **Groups**: Recursively evaluate all children and combine with AND/OR
 *
 * @param item - The media item being evaluated
 * @param node - The current node to evaluate (condition or group)
 * @returns `true` if the node evaluates to true, `false` otherwise
 *
 * @internal
 */
function evaluateNode(item: MediaItem, node: Condition | ConditionGroup): boolean {
  if (node.type === 'condition') {
    return evaluateCondition(item, node)
  } else {
    // Evaluate group
    const results = node.conditions.map(child => evaluateNode(item, child))

    if (node.operator === 'AND') {
      return results.every(r => r === true)
    } else {
      return results.some(r => r === true)
    }
  }
}

/**
 * Evaluates a single condition against a media item.
 *
 * Performs type-aware comparison based on the field definition:
 *
 * ## Evaluation Steps
 *
 * 1. Extract field value from item using `getFieldValue`
 * 2. Handle null/notNull operators first (special case)
 * 3. Look up field definition for type information
 * 4. Apply special handling for `lastWatchedAt` with `olderThan` (null = old)
 * 5. Fail if field is null (except for handled special cases)
 * 6. Delegate to type-specific comparison function
 *
 * ## Null Value Handling
 *
 * - `null` operator: Returns true if field is null/undefined
 * - `notNull` operator: Returns true if field has a value
 * - Other operators: Null field values return false (fail safe)
 * - **Exception**: `lastWatchedAt` with `olderThan` treats null as "old"
 *
 * @param item - The media item to evaluate
 * @param condition - The condition to check
 * @returns `true` if the condition is satisfied, `false` otherwise
 *
 * @internal
 */
function evaluateCondition(item: MediaItem, condition: Condition): boolean {
  const fieldValue = getFieldValue(item, condition.field)
  const conditionValue = condition.value

  // Handle null checks first
  if (condition.operator === 'null') {
    return fieldValue === null || fieldValue === undefined
  }
  if (condition.operator === 'notNull') {
    return fieldValue !== null && fieldValue !== undefined
  }

  // Get field definition for type-specific comparison
  const fieldDef = FIELD_DEFINITIONS.find(f => f.key === condition.field)
  if (!fieldDef) {
    console.warn(`Unknown field in condition: ${condition.field}`)
    return false
  }

  // Special handling for lastWatchedAt with olderThan operator - null/undefined should match (never watched = old)
  if (fieldDef.type === 'date' && condition.operator === 'olderThan' && condition.field === 'lastWatchedAt') {
    if (fieldValue === null || fieldValue === undefined) {
      return true // Never watched = old
    }
  }

  // If field value is null/undefined and not checking for null, fail safe (except for olderThan dates)
  if (fieldValue === null || fieldValue === undefined) {
    return false
  }

  // Type-specific comparisons
  switch (fieldDef.type) {
    case 'string':
      return evaluateStringCondition(
        fieldValue as string,
        condition.operator as StringOperator,
        conditionValue as string | string[]
      )
    case 'number':
      return evaluateNumberCondition(
        fieldValue as number,
        condition.operator as NumberOperator,
        conditionValue as number | number[]
      )
    case 'date':
      return evaluateDateCondition(
        fieldValue as Date,
        condition.operator as DateOperator,
        conditionValue,
        condition.valueUnit
      )
    case 'boolean':
      return evaluateBooleanCondition(
        fieldValue as boolean,
        condition.operator as BooleanOperator,
        conditionValue as boolean
      )
    case 'array':
      return evaluateArrayCondition(
        fieldValue as string[],
        condition.operator as ArrayOperator,
        conditionValue as string | string[]
      )
    case 'enum':
      // For enum types, if using comparison operators, treat as string comparison
      if (condition.operator === 'lessThanOrEqual' || condition.operator === 'lessThan' ||
          condition.operator === 'greaterThanOrEqual' || condition.operator === 'greaterThan') {
        // Use string comparison for enum values
        const fieldStr = String(fieldValue)
        const conditionStr = String(conditionValue)
        switch (condition.operator) {
          case 'lessThanOrEqual':
            return fieldStr <= conditionStr
          case 'lessThan':
            return fieldStr < conditionStr
          case 'greaterThanOrEqual':
            return fieldStr >= conditionStr
          case 'greaterThan':
            return fieldStr > conditionStr
          default:
            return false
        }
      }
      return evaluateStringCondition(
        fieldValue as string,
        condition.operator as StringOperator,
        conditionValue as string | string[]
      )
    default:
      return false
  }
}

/**
 * Extracts a field value from a media item by key.
 *
 * Supports both direct field access and nested field paths using dot notation.
 *
 * ## Supported Patterns
 *
 * - **Direct fields**: `"title"`, `"playCount"`, `"year"`
 * - **Nested fields**: `"radarr.hasFile"`, `"sonarr.monitored"`
 * - **Computed fields**: `"neverWatched"` (computed from playCount)
 *
 * ## Field Validation
 *
 * Only fields defined in `FIELD_DEFINITIONS` are allowed. Unknown field keys
 * will log a warning and return null.
 *
 * @param item - The media item to extract from
 * @param fieldKey - The field key (e.g., "title", "radarr.monitored")
 * @returns The field value, or null if not found or undefined
 *
 * @internal
 */
function getFieldValue(item: MediaItem, fieldKey: string): unknown {
  // Validate field key exists in FIELD_DEFINITIONS
  const fieldDef = FIELD_DEFINITIONS.find(f => f.key === fieldKey)
  if (!fieldDef) {
    console.warn(`Unknown field key: ${fieldKey}`)
    return null
  }

  // Handle special cases
  if (fieldKey === 'neverWatched') {
    return item.playCount === 0
  }

  // Handle nested fields (e.g., "radarr.hasFile")
  if (fieldKey.includes('.')) {
    const parts = fieldKey.split('.')
    let value: unknown = item
    for (const part of parts) {
      value = (value as Record<string, unknown>)?.[part]
      if (value === undefined) return null
    }
    return value
  }

  // Direct field access
  return (item as unknown as Record<string, unknown>)[fieldKey]
}

/**
 * Evaluates string comparison operations.
 *
 * Supports equality, pattern matching, and set membership operations.
 * All string comparisons are case-insensitive for user-friendly matching.
 *
 * ## Operators
 *
 * - `equals` / `notEquals`: Exact string match
 * - `contains` / `notContains`: Substring search (case-insensitive)
 * - `startsWith` / `endsWith`: Prefix/suffix match (case-insensitive)
 * - `regex`: Regular expression match (case-insensitive)
 * - `in` / `notIn`: Set membership (exact match)
 *
 * @param fieldValue - The string value from the media item
 * @param operator - The comparison operator
 * @param conditionValue - The value(s) to compare against
 * @returns `true` if the comparison succeeds
 *
 * @internal
 */
function evaluateStringCondition(
  fieldValue: string,
  operator: StringOperator,
  conditionValue: string | string[]
): boolean {
  switch (operator) {
    case 'equals':
      return fieldValue === conditionValue
    case 'notEquals':
      return fieldValue !== conditionValue
    case 'contains':
      return fieldValue.toLowerCase().includes((conditionValue as string).toLowerCase())
    case 'notContains':
      return !fieldValue.toLowerCase().includes((conditionValue as string).toLowerCase())
    case 'startsWith':
      return fieldValue.toLowerCase().startsWith((conditionValue as string).toLowerCase())
    case 'endsWith':
      return fieldValue.toLowerCase().endsWith((conditionValue as string).toLowerCase())
    case 'regex':
      try {
        const regex = new RegExp(conditionValue as string, 'i')
        return regex.test(fieldValue)
      } catch {
        return false
      }
    case 'in':
      return (conditionValue as string[]).includes(fieldValue)
    case 'notIn':
      return !(conditionValue as string[]).includes(fieldValue)
    default:
      return false
  }
}

/**
 * Evaluates number comparison operations.
 *
 * Supports equality, relational, and range comparisons.
 *
 * ## Operators
 *
 * - `equals` / `notEquals`: Exact numeric match
 * - `greaterThan` / `greaterThanOrEqual`: Greater than comparison
 * - `lessThan` / `lessThanOrEqual`: Less than comparison
 * - `between`: Inclusive range check `[min, max]`
 *
 * @param fieldValue - The numeric value from the media item
 * @param operator - The comparison operator
 * @param conditionValue - The value(s) to compare against
 * @returns `true` if the comparison succeeds
 *
 * @internal
 */
function evaluateNumberCondition(
  fieldValue: number,
  operator: NumberOperator,
  conditionValue: number | number[]
): boolean {
  switch (operator) {
    case 'equals':
      return fieldValue === conditionValue
    case 'notEquals':
      return fieldValue !== conditionValue
    case 'greaterThan':
      return fieldValue > (conditionValue as number)
    case 'greaterThanOrEqual':
      return fieldValue >= (conditionValue as number)
    case 'lessThan':
      return fieldValue < (conditionValue as number)
    case 'lessThanOrEqual':
      return fieldValue <= (conditionValue as number)
    case 'between': {
      const [min, max] = conditionValue as number[]
      return fieldValue >= min && fieldValue <= max
    }
    default:
      return false
  }
}

/**
 * Evaluates date comparison operations.
 *
 * Supports both absolute date comparisons and relative time checks.
 *
 * ## Operators
 *
 * - `before` / `after`: Compare against absolute date
 * - `between`: Inclusive date range check
 * - `olderThan`: Relative comparison (e.g., "older than 365 days")
 * - `newerThan`: Relative comparison (e.g., "newer than 30 days")
 *
 * ## Relative Time Units
 *
 * For `olderThan` and `newerThan`, the `unit` parameter specifies:
 * - `days`: Value is number of days
 * - `months`: Value is number of months (30-day approximation)
 * - `years`: Value is number of years (365-day approximation)
 *
 * @param fieldValue - The date value from the media item
 * @param operator - The comparison operator
 * @param conditionValue - The date or number to compare against
 * @param unit - Time unit for relative comparisons ('days' | 'months' | 'years')
 * @returns `true` if the comparison succeeds
 *
 * @internal
 */
function evaluateDateCondition(
  fieldValue: Date,
  operator: DateOperator,
  conditionValue: any,
  unit?: string
): boolean {
  switch (operator) {
    case 'before':
      return fieldValue < new Date(conditionValue)
    case 'after':
      return fieldValue > new Date(conditionValue)
    case 'between': {
      const [start, end] = conditionValue as string[]
      return fieldValue >= new Date(start) && fieldValue <= new Date(end)
    }
    case 'olderThan': {
      const threshold = calculateDateThreshold(conditionValue, unit as 'days' | 'months' | 'years')
      return fieldValue < threshold
    }
    case 'newerThan': {
      const threshold2 = calculateDateThreshold(conditionValue, unit as 'days' | 'months' | 'years')
      return fieldValue > threshold2
    }
    default:
      return false
  }
}

/**
 * Calculates the threshold date for relative date comparisons.
 *
 * Subtracts the specified amount of time from the current date.
 *
 * ## Approximations
 *
 * - **months**: Approximated as 30 days
 * - **years**: Approximated as 365 days (no leap year handling)
 *
 * @param value - The number of time units to subtract
 * @param unit - The time unit ('days', 'months', or 'years')
 * @returns A Date object representing the calculated threshold
 *
 * @example
 * ```ts
 * // Get the date 90 days ago
 * const threshold = calculateDateThreshold(90, 'days')
 *
 * // Check if a date is older than 90 days
 * if (someDate < threshold) {
 *   console.log('Date is older than 90 days')
 * }
 * ```
 *
 * @internal
 */
function calculateDateThreshold(value: number, unit: 'days' | 'months' | 'years'): Date {
  const now = new Date()
  switch (unit) {
    case 'days':
      return new Date(now.getTime() - value * 24 * 60 * 60 * 1000)
    case 'months':
      return new Date(now.getTime() - value * 30 * 24 * 60 * 60 * 1000)
    case 'years':
      return new Date(now.getTime() - value * 365 * 24 * 60 * 60 * 1000)
  }
}

/**
 * Evaluates boolean comparison operations.
 *
 * Simple equality check for boolean field values.
 *
 * ## Operators
 *
 * - `equals`: True if values match
 * - `notEquals`: True if values differ
 *
 * @param fieldValue - The boolean value from the media item
 * @param operator - The comparison operator
 * @param conditionValue - The expected boolean value
 * @returns `true` if the comparison succeeds
 *
 * @internal
 */
function evaluateBooleanCondition(
  fieldValue: boolean,
  operator: BooleanOperator,
  conditionValue: boolean
): boolean {
  switch (operator) {
    case 'equals':
      return fieldValue === conditionValue
    case 'notEquals':
      return fieldValue !== conditionValue
    default:
      return false
  }
}

/**
 * Evaluates array comparison operations.
 *
 * Used for array fields like `genres` and `labels`.
 *
 * ## Operators
 *
 * - `contains`: Array includes the specified value
 * - `notContains`: Array does not include the specified value
 * - `containsAny`: Array includes at least one of the specified values
 * - `containsAll`: Array includes all of the specified values
 * - `isEmpty`: Array has no elements
 * - `isNotEmpty`: Array has at least one element
 *
 * @param fieldValue - The array value from the media item
 * @param operator - The comparison operator
 * @param conditionValue - The value(s) to check for
 * @returns `true` if the comparison succeeds
 *
 * @internal
 */
function evaluateArrayCondition(
  fieldValue: string[],
  operator: ArrayOperator,
  conditionValue: string | string[]
): boolean {
  switch (operator) {
    case 'contains':
      return fieldValue.includes(conditionValue as string)
    case 'notContains':
      return !fieldValue.includes(conditionValue as string)
    case 'containsAny':
      return (conditionValue as string[]).some(v => fieldValue.includes(v))
    case 'containsAll':
      return (conditionValue as string[]).every(v => fieldValue.includes(v))
    case 'isEmpty':
      return fieldValue.length === 0
    case 'isNotEmpty':
      return fieldValue.length > 0
    default:
      return false
  }
}

/**
 * Calculates complexity metrics for a rule criteria tree.
 *
 * Used by the UI to display a complexity indicator to the user.
 *
 * ## Complexity Levels
 *
 * - **simple**: ≤5 conditions and ≤2 depth
 * - **moderate**: >5 conditions OR >2 depth (but ≤10 conditions and ≤3 depth)
 * - **complex**: >10 conditions OR >3 depth
 *
 * ## Metrics Calculated
 *
 * - `conditionCount`: Total number of leaf conditions in the tree
 * - `groupCount`: Total number of groups (including root)
 * - `maxDepth`: Maximum nesting level (root = 0)
 *
 * @param criteria - The rule criteria tree to analyze
 * @returns An object containing complexity metrics and level
 *
 * @example
 * ```ts
 * const complexity = calculateComplexity(ruleCriteria)
 *
 * // { conditionCount: 3, groupCount: 2, maxDepth: 1, complexity: 'simple' }
 * console.log(complexity)
 *
 * // Use in UI
 * <ComplexityBadge level={complexity.complexity} />
 * ```
 */
export function calculateComplexity(criteria: RuleCriteria): {
  conditionCount: number
  groupCount: number
  maxDepth: number
  complexity: 'simple' | 'moderate' | 'complex'
} {
  let conditionCount = 0
  let groupCount = 0
  let maxDepth = 0

  function traverse(node: Condition | ConditionGroup, depth: number) {
    maxDepth = Math.max(maxDepth, depth)

    if (node.type === 'condition') {
      conditionCount++
    } else {
      groupCount++
      node.conditions.forEach(child => traverse(child, depth + 1))
    }
  }

  traverse(criteria, 0)

  let complexity: 'simple' | 'moderate' | 'complex' = 'simple'
  if (conditionCount > 5 || maxDepth > 2) complexity = 'moderate'
  if (conditionCount > 10 || maxDepth > 3) complexity = 'complex'

  return { conditionCount, groupCount, maxDepth, complexity }
}
