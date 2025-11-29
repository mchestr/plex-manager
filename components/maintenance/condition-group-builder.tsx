"use client"

/**
 * Recursive Condition Group Builder
 *
 * A React component for building nested condition groups with AND/OR logic.
 * This component renders a tree structure of conditions and groups, allowing
 * users to create complex filter rules through an intuitive UI.
 *
 * ## Recursion Model
 *
 * The component uses self-referential recursion to handle nested groups:
 * - Root group (depth=0): Primary container with cyan styling
 * - Nested groups (depth>0): Rendered as children with purple styling
 * - Each group can contain conditions OR other groups (not both types are required)
 *
 * ## Depth Handling
 *
 * While there's no hard-coded depth limit, the UI uses depth-based styling:
 * - depth=0: Cyan left border (root)
 * - depth=1: Purple left border (first-level nesting)
 * - depth>1: Slate border (deep nesting)
 *
 * ## Empty Group Behavior
 *
 * When the last condition is removed from a non-root group, the entire group
 * is automatically removed to prevent orphaned empty groups.
 *
 * @module components/maintenance/condition-group-builder
 */

import type { ConditionGroup, Condition, MediaType } from "@/lib/validations/maintenance"
import type { FieldDefinition } from "@/lib/maintenance/field-registry"
import { generateId } from "@/lib/maintenance/field-registry"
import { ConditionBuilder } from "./condition-builder"
import { cn } from "@/lib/utils"

/**
 * Props for the ConditionGroupBuilder component.
 */
interface ConditionGroupBuilderProps {
  /** The condition group data to render and edit */
  group: ConditionGroup
  /** Callback fired when the group structure or contents change */
  onChange: (group: ConditionGroup) => void
  /** Available fields that can be used in conditions (filtered by media type) */
  availableFields: FieldDefinition[]
  /** Current nesting depth (0 = root, used for styling and empty-group removal logic) */
  depth: number
  /** Media type context for field filtering (MOVIE or TV_SERIES) */
  mediaType: MediaType
  /** Optional callback to remove this group (not available at root level) */
  onRemove?: () => void
}

/**
 * Recursive condition group builder supporting nested AND/OR logic.
 *
 * Renders a tree of conditions and groups with add/remove controls.
 * Each node in the tree is either a single condition (field comparison)
 * or a group containing multiple conditions/groups combined with AND/OR.
 *
 * @param props - Component props
 * @param props.group - Current condition group to render
 * @param props.onChange - Callback fired when group structure changes
 * @param props.availableFields - Fields that can be used in conditions
 * @param props.depth - Current nesting depth (0 = root, used for UI styling)
 * @param props.mediaType - Media type (MOVIE/TV_SERIES) for field filtering
 * @param props.onRemove - Optional callback to remove this group from parent
 *
 * @example
 * ```tsx
 * // Basic usage at root level
 * <ConditionGroupBuilder
 *   group={rootGroup}
 *   onChange={handleChange}
 *   availableFields={movieFields}
 *   depth={0}
 *   mediaType="MOVIE"
 * />
 *
 * // Nested usage (handled internally via recursion)
 * <ConditionGroupBuilder
 *   group={nestedGroup}
 *   onChange={(updated) => updateChild(index, updated)}
 *   onRemove={() => removeChild(index)}
 *   availableFields={movieFields}
 *   depth={1}
 *   mediaType="MOVIE"
 * />
 * ```
 */
export function ConditionGroupBuilder({
  group,
  onChange,
  availableFields,
  depth,
  mediaType,
  onRemove,
}: ConditionGroupBuilderProps) {
  /**
   * Adds a new condition to this group.
   * Uses the first available field as the default, with its first allowed operator.
   */
  const addCondition = () => {
    const firstField = availableFields[0]
    onChange({
      ...group,
      conditions: [
        ...group.conditions,
        {
          type: 'condition',
          id: generateId(),
          field: firstField.key,
          operator: firstField.allowedOperators[0],
          value: null,
        }
      ]
    })
  }

  /**
   * Adds a new nested group to this group.
   * Creates a group with AND operator containing one default condition.
   * This enables users to build complex nested logic like:
   * `(A AND B) OR (C AND D)`
   */
  const addGroup = () => {
    const firstField = availableFields[0]
    onChange({
      ...group,
      conditions: [
        ...group.conditions,
        {
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
          ]
        }
      ]
    })
  }

  /**
   * Toggles the group's logical operator between AND and OR.
   * - AND: All conditions in this group must match
   * - OR: At least one condition in this group must match
   */
  const toggleOperator = () => {
    onChange({
      ...group,
      operator: group.operator === 'AND' ? 'OR' : 'AND'
    })
  }

  /**
   * Updates a condition or nested group at the specified index.
   * Called when a child component reports changes to its state.
   *
   * @param index - Position of the child in the conditions array
   * @param updated - New state for the condition or group
   */
  const updateCondition = (index: number, updated: Condition | ConditionGroup) => {
    const newConditions = [...group.conditions]
    newConditions[index] = updated
    onChange({ ...group, conditions: newConditions })
  }

  /**
   * Removes a condition or nested group at the specified index.
   *
   * Special behavior: If this removal would leave a non-root group empty,
   * the entire group is removed instead (via onRemove callback) to prevent
   * orphaned empty groups in the tree.
   *
   * @param index - Position of the child to remove
   */
  const removeCondition = (index: number) => {
    const newConditions = group.conditions.filter((_, i) => i !== index)

    // If this would leave the group empty and it's not the root, remove the group itself
    if (newConditions.length === 0 && depth > 0 && onRemove) {
      onRemove()
    } else {
      onChange({ ...group, conditions: newConditions })
    }
  }

  /** Whether this is the root group (depth === 0) - affects styling and removal behavior */
  const isRoot = depth === 0

  /** Border color based on nesting depth for visual hierarchy */
  const borderColor = isRoot ? 'border-cyan-500' : depth === 1 ? 'border-purple-500/50' : 'border-slate-600'

  return (
    <div
      className={cn(
        "border-l-2 pl-4 space-y-3",
        borderColor,
        depth > 0 && "mt-2"
      )}
    >
      {/* Group Header */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* AND/OR Toggle */}
        <button
          type="button"
          onClick={toggleOperator}
          className={cn(
            "px-3 py-1.5 rounded-md text-xs font-bold transition-colors",
            group.operator === 'AND'
              ? "bg-cyan-600 hover:bg-cyan-700 text-white"
              : "bg-purple-600 hover:bg-purple-700 text-white"
          )}
          data-testid="maintenance-rule-operator-toggle"
        >
          {group.operator}
        </button>

        <span className="text-xs text-slate-400">
          {group.operator === 'AND' ? 'All conditions must match' : 'Any condition can match'}
        </span>

        {/* Remove Group Button (only for non-root groups) */}
        {!isRoot && onRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="ml-auto text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded hover:bg-red-400/10 transition-colors"
            data-testid="maintenance-rule-remove-group"
          >
            Remove Group
          </button>
        )}
      </div>

      {/* Conditions */}
      <div className="space-y-2">
        {group.conditions.map((node, index) => (
          <div key={node.id}>
            {node.type === 'condition' ? (
              <ConditionBuilder
                condition={node}
                onChange={(updated) => updateCondition(index, updated)}
                onRemove={() => removeCondition(index)}
                availableFields={availableFields}
                mediaType={mediaType}
              />
            ) : (
              <ConditionGroupBuilder
                group={node}
                onChange={(updated) => updateCondition(index, updated)}
                onRemove={() => removeCondition(index)}
                availableFields={availableFields}
                depth={depth + 1}
                mediaType={mediaType}
              />
            )}
          </div>
        ))}
      </div>

      {/* Add Buttons */}
      <div className="flex gap-2 pt-2">
        <button
          type="button"
          onClick={addCondition}
          className="text-xs text-cyan-400 hover:text-cyan-300 hover:bg-cyan-400/10 px-3 py-1.5 rounded transition-colors flex items-center gap-1"
          data-testid="maintenance-rule-add-condition"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Condition
        </button>

        <button
          type="button"
          onClick={addGroup}
          className="text-xs text-purple-400 hover:text-purple-300 hover:bg-purple-400/10 px-3 py-1.5 rounded transition-colors flex items-center gap-1"
          data-testid="maintenance-rule-add-group"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Group
        </button>
      </div>
    </div>
  )
}
