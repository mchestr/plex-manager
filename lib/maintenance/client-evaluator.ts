/**
 * Client-Side Rule Evaluator
 *
 * Browser-safe version of the rule evaluator for real-time feedback
 * during rule building. This module has NO server-side dependencies
 * and can be safely imported in client components.
 *
 * @module lib/maintenance/client-evaluator
 */

import type { RuleCriteria, Condition, ConditionGroup } from "@/lib/validations/maintenance"
import {
  FIELD_DEFINITIONS,
  type StringOperator,
  type NumberOperator,
  type DateOperator,
  type BooleanOperator,
  type ArrayOperator,
} from "./field-registry"

// Re-export MediaItem type for client usage
export type { MediaItem } from "./rule-evaluator"
import type { MediaItem } from "./rule-evaluator"

/**
 * Result of evaluating a single condition
 */
export interface ConditionResult {
  conditionId: string
  field: string
  fieldLabel: string
  operator: string
  expectedValue: unknown
  actualValue: unknown
  passed: boolean
}

/**
 * Detailed evaluation result with per-condition breakdown
 */
export interface EvaluationResult {
  matches: boolean
  conditionResults: ConditionResult[]
}

/**
 * Evaluates a rule criteria against a media item (client-side).
 *
 * This is the main entry point for client-side evaluation.
 * Returns a boolean indicating if the item matches the rule.
 *
 * @param item - The media item to evaluate
 * @param criteria - The rule criteria (hierarchical format)
 * @returns true if the item matches the rule
 */
export function evaluateRuleClient(
  item: MediaItem,
  criteria: RuleCriteria
): boolean {
  return evaluateNode(item, criteria)
}

/**
 * Evaluates a rule with detailed per-condition results.
 *
 * Use this for showing match/no-match indicators on each condition
 * during rule building.
 *
 * @param item - The media item to evaluate
 * @param criteria - The rule criteria
 * @returns Evaluation result with match status and condition breakdown
 */
export function evaluateRuleWithDetails(
  item: MediaItem,
  criteria: RuleCriteria
): EvaluationResult {
  const conditionResults: ConditionResult[] = []

  function collectConditions(node: Condition | ConditionGroup): void {
    if (node.type === 'condition') {
      const fieldDef = FIELD_DEFINITIONS.find(f => f.key === node.field)
      const actualValue = getFieldValue(item, node.field)
      const passed = evaluateCondition(item, node)

      conditionResults.push({
        conditionId: node.id,
        field: node.field,
        fieldLabel: fieldDef?.label || node.field,
        operator: node.operator,
        expectedValue: node.value,
        actualValue,
        passed,
      })
    } else if (node.conditions && Array.isArray(node.conditions)) {
      node.conditions.forEach(child => collectConditions(child))
    }
  }

  collectConditions(criteria)
  const matches = evaluateNode(item, criteria)

  return { matches, conditionResults }
}

/**
 * Batch evaluate multiple items against a rule.
 *
 * Use this for showing match counts in the media browser.
 *
 * @param items - Array of media items to evaluate
 * @param criteria - The rule criteria
 * @returns Object with matched and non-matched item arrays
 */
export function evaluateMany(
  items: MediaItem[],
  criteria: RuleCriteria
): { matches: MediaItem[]; nonMatches: MediaItem[] } {
  const matches: MediaItem[] = []
  const nonMatches: MediaItem[] = []

  for (const item of items) {
    if (evaluateRuleClient(item, criteria)) {
      matches.push(item)
    } else {
      nonMatches.push(item)
    }
  }

  return { matches, nonMatches }
}

// ─── Internal Evaluation Functions ───────────────────────────────────────────

function evaluateNode(item: MediaItem, node: Condition | ConditionGroup): boolean {
  if (node.type === 'condition') {
    return evaluateCondition(item, node)
  } else {
    // Handle case where conditions might be undefined or empty
    if (!node.conditions || !Array.isArray(node.conditions) || node.conditions.length === 0) {
      // Empty group: AND returns true (no conditions to fail), OR returns false (no conditions to pass)
      return node.operator === 'AND'
    }

    const results = node.conditions.map(child => evaluateNode(item, child))

    if (node.operator === 'AND') {
      return results.every(r => r === true)
    } else {
      return results.some(r => r === true)
    }
  }
}

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

  // Special handling for lastWatchedAt with olderThan - null means never watched = old
  if (fieldDef.type === 'date' && condition.operator === 'olderThan' && condition.field === 'lastWatchedAt') {
    if (fieldValue === null || fieldValue === undefined) {
      return true
    }
  }

  // If field value is null/undefined and not checking for null, fail safe
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
        fieldValue as Date | string,
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
        fieldValue as (string | number)[],
        condition.operator as ArrayOperator,
        conditionValue as string | string[] | number | number[]
      )
    case 'enum':
      return evaluateStringCondition(
        fieldValue as string,
        condition.operator as StringOperator,
        conditionValue as string | string[]
      )
    default:
      return false
  }
}

function getFieldValue(item: MediaItem, fieldKey: string): unknown {
  // Handle special computed fields
  if (fieldKey === 'neverWatched') {
    return (item.playCount as number) === 0
  }

  // Computed: Days since added
  if (fieldKey === 'daysSinceAdded') {
    const addedAt = item.addedAt as Date | string | null | undefined
    if (!addedAt) return null
    const addedDate = typeof addedAt === 'string' ? new Date(addedAt) : addedAt
    const now = new Date()
    return Math.floor((now.getTime() - addedDate.getTime()) / (24 * 60 * 60 * 1000))
  }

  // Computed: Days since last watched
  if (fieldKey === 'daysSinceWatched') {
    const lastWatchedAt = item.lastWatchedAt as Date | string | null | undefined
    if (!lastWatchedAt) return null
    const watchedDate = typeof lastWatchedAt === 'string' ? new Date(lastWatchedAt) : lastWatchedAt
    const now = new Date()
    return Math.floor((now.getTime() - watchedDate.getTime()) / (24 * 60 * 60 * 1000))
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

function evaluateDateCondition(
  fieldValue: Date | string,
  operator: DateOperator,
  conditionValue: unknown,
  unit?: string
): boolean {
  // Convert string dates to Date objects
  const dateValue = typeof fieldValue === 'string' ? new Date(fieldValue) : fieldValue

  switch (operator) {
    case 'before':
      return dateValue < new Date(conditionValue as string)
    case 'after':
      return dateValue > new Date(conditionValue as string)
    case 'between': {
      const [start, end] = conditionValue as string[]
      return dateValue >= new Date(start) && dateValue <= new Date(end)
    }
    case 'olderThan': {
      const threshold = calculateDateThreshold(conditionValue as number, unit as 'days' | 'months' | 'years')
      return dateValue < threshold
    }
    case 'newerThan': {
      const threshold = calculateDateThreshold(conditionValue as number, unit as 'days' | 'months' | 'years')
      return dateValue > threshold
    }
    default:
      return false
  }
}

function calculateDateThreshold(value: number, unit: 'days' | 'months' | 'years'): Date {
  const now = new Date()
  switch (unit) {
    case 'days':
      return new Date(now.getTime() - value * 24 * 60 * 60 * 1000)
    case 'months':
      return new Date(now.getTime() - value * 30 * 24 * 60 * 60 * 1000)
    case 'years':
      return new Date(now.getTime() - value * 365 * 24 * 60 * 60 * 1000)
    default:
      return new Date(now.getTime() - value * 24 * 60 * 60 * 1000)
  }
}

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

function evaluateArrayCondition(
  fieldValue: (string | number)[],
  operator: ArrayOperator,
  conditionValue: string | string[] | number | number[]
): boolean {
  switch (operator) {
    case 'contains':
      return fieldValue.includes(conditionValue as string | number)
    case 'notContains':
      return !fieldValue.includes(conditionValue as string | number)
    case 'containsAny':
      return (conditionValue as (string | number)[]).some(v => fieldValue.includes(v))
    case 'containsAll':
      return (conditionValue as (string | number)[]).every(v => fieldValue.includes(v))
    case 'isEmpty':
      return fieldValue.length === 0
    case 'isNotEmpty':
      return fieldValue.length > 0
    default:
      return false
  }
}
