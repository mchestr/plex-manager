/**
 * Enhanced Rule Evaluator with Hierarchical Support
 *
 * Evaluates maintenance rules against media items using a recursive tree-based approach.
 * Supports nested AND/OR groups and comprehensive field comparisons.
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
 * Extended media item interface for rule evaluation
 * Supports all fields from Plex, Tautulli, Radarr, and Sonarr
 */
export interface MediaItem {
  // Core identification
  plexRatingKey: string
  title: string
  year?: number
  libraryId?: string

  // Playback statistics
  playCount: number
  lastWatchedAt?: Date | null
  addedAt?: Date | null

  // File information
  fileSize?: bigint | null
  filePath?: string | null
  duration?: number | null // in seconds

  // Quality/technical
  resolution?: string | null
  videoCodec?: string | null
  audioCodec?: string | null
  container?: string | null
  bitrate?: number | null

  // Metadata
  rating?: number | null
  audienceRating?: number | null
  contentRating?: string | null
  genres?: string[]
  labels?: string[]

  // External service data (optional)
  radarr?: {
    hasFile?: boolean
    monitored?: boolean
    qualityProfileId?: number
    minimumAvailability?: string
  }
  sonarr?: {
    monitored?: boolean
    status?: string
    episodeFileCount?: number
    percentOfEpisodes?: number
  }
}

/**
 * Main evaluation function - evaluates hierarchical rule criteria against media item
 * Supports both new hierarchical format and legacy flat format (auto-migrates)
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
 * Recursively evaluate a node (condition or group)
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
 * Evaluate a single condition against the media item
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
 * Get field value from media item (supports nested fields like "radarr.hasFile")
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
 * String comparison operations
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
 * Number comparison operations
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
 * Date comparison operations
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
 * Calculate date threshold for relative date comparisons
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
 * Boolean comparison operations
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
 * Array comparison operations
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
 * Calculate rule complexity metrics for UI display
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
