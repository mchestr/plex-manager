"use client"

/**
 * Enhanced Hierarchical Rule Builder
 *
 * A powerful, intuitive UI component for building complex maintenance rules
 * with nested AND/OR groups. This is the main entry point for the rule
 * building interface.
 *
 * ## Features
 *
 * - Hierarchical condition building with unlimited nesting
 * - Support for all field types from Plex, Tautulli, Radarr, and Sonarr
 * - Real-time complexity indicator showing rule metrics
 * - Context-aware field filtering based on media type
 * - Inline help text explaining the UI
 *
 * ## Architecture
 *
 * This component serves as the main container and orchestrator:
 * - Delegates condition/group rendering to {@link ConditionGroupBuilder}
 * - Calculates and displays complexity metrics
 * - Provides context-aware field definitions based on media type
 *
 * @module components/maintenance/enhanced-rule-builder
 */

import type { RuleCriteria, MediaType } from "@/lib/validations/maintenance"
import { getFieldsForMediaType, generateId } from "@/lib/maintenance/field-registry"
import { calculateComplexity } from "@/lib/maintenance/rule-evaluator"
import { ConditionGroupBuilder } from "./condition-group-builder"
import { RuleComplexityIndicator } from "./rule-complexity-indicator"

/**
 * Props for the EnhancedRuleBuilder component.
 */
interface EnhancedRuleBuilderProps {
  /** The current rule criteria being edited */
  value: RuleCriteria
  /** Callback fired when the criteria changes */
  onChange: (criteria: RuleCriteria) => void
  /** Media type context - determines available fields (MOVIE or TV_SERIES) */
  mediaType: MediaType
}

/**
 * Main rule builder component for creating hierarchical maintenance rules.
 *
 * Provides a complete UI for building rules including:
 * - A header with title and description
 * - The main rule tree (via ConditionGroupBuilder)
 * - Complexity indicator showing rule metrics
 * - Help text explaining how to use the interface
 *
 * @param props - Component props
 * @param props.value - The current rule criteria (root condition group)
 * @param props.onChange - Called when any part of the rule changes
 * @param props.mediaType - Determines which fields are available
 *
 * @example
 * ```tsx
 * const [criteria, setCriteria] = useState(() => createDefaultCriteria("MOVIE"))
 *
 * <EnhancedRuleBuilder
 *   value={criteria}
 *   onChange={setCriteria}
 *   mediaType="MOVIE"
 * />
 * ```
 */
export function EnhancedRuleBuilder({ value, onChange, mediaType }: EnhancedRuleBuilderProps) {
  /** Fields available for conditions, filtered by the current media type */
  const availableFields = getFieldsForMediaType(mediaType)

  /** Complexity metrics for the current rule (condition count, depth, etc.) */
  const complexity = calculateComplexity(value)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-white">Rule Criteria</h3>
          <p className="text-sm text-slate-400 mt-1">
            Define conditions that media must match. Combine conditions with AND/OR groups for complex logic.
          </p>
        </div>
      </div>

      {/* Rule Tree */}
      <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-6">
        <ConditionGroupBuilder
          group={value}
          onChange={onChange}
          availableFields={availableFields}
          depth={0}
          mediaType={mediaType}
        />
      </div>

      {/* Complexity Indicator */}
      <RuleComplexityIndicator complexity={complexity} />

      {/* Help Text */}
      <div className="bg-slate-800/30 border border-slate-700/50 rounded-lg p-4">
        <h4 className="text-sm font-medium text-white mb-2">How to use</h4>
        <ul className="text-sm text-slate-400 space-y-1">
          <li>• Click <span className="text-cyan-400 font-medium">+ Add Condition</span> to add a new field comparison</li>
          <li>• Click <span className="text-purple-400 font-medium">+ Add Group</span> to create a nested AND/OR group</li>
          <li>• Use the <span className="font-medium">AND/OR</span> toggle to change how conditions are combined</li>
          <li>• <span className="font-medium">AND</span> = all conditions must match</li>
          <li>• <span className="font-medium">OR</span> = any condition can match</li>
        </ul>
      </div>
    </div>
  )
}

/**
 * Creates a default empty rule criteria with one initial condition.
 *
 * Used when creating new rules to provide a valid starting state.
 * The initial condition uses the first available field for the given
 * media type with its first allowed operator and a null value.
 *
 * @param mediaType - The media type to create criteria for (MOVIE or TV_SERIES)
 * @returns A new RuleCriteria object with a root AND group containing one condition
 *
 * @example
 * ```tsx
 * // Create default criteria for a movie rule
 * const criteria = createDefaultCriteria("MOVIE")
 * // Returns: { type: 'group', operator: 'AND', conditions: [{ type: 'condition', ... }] }
 *
 * // Use in state initialization
 * const [criteria, setCriteria] = useState(() => createDefaultCriteria("TV_SERIES"))
 * ```
 */
export function createDefaultCriteria(mediaType: MediaType): RuleCriteria {
  const availableFields = getFieldsForMediaType(mediaType)
  const firstField = availableFields[0]

  return {
    type: 'group',
    id: generateId(),
    operator: 'AND',
    conditions: [
      {
        type: 'condition',
        id: generateId(),
        field: firstField.key,
        operator: firstField.allowedOperators[0],
        value: null,
      }
    ],
  }
}
