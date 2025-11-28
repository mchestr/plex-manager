"use client"

/**
 * Recursive Condition Group Builder
 *
 * Displays a group of conditions with AND/OR logic and allows nesting of sub-groups.
 */

import type { ConditionGroup, Condition, MediaType } from "@/lib/validations/maintenance"
import type { FieldDefinition } from "@/lib/maintenance/field-registry"
import { generateId } from "@/lib/maintenance/field-registry"
import { ConditionBuilder } from "./condition-builder"
import { cn } from "@/lib/utils"

interface ConditionGroupBuilderProps {
  group: ConditionGroup
  onChange: (group: ConditionGroup) => void
  availableFields: FieldDefinition[]
  depth: number
  mediaType: MediaType
  onRemove?: () => void
}

export function ConditionGroupBuilder({
  group,
  onChange,
  availableFields,
  depth,
  mediaType,
  onRemove,
}: ConditionGroupBuilderProps) {
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

  const toggleOperator = () => {
    onChange({
      ...group,
      operator: group.operator === 'AND' ? 'OR' : 'AND'
    })
  }

  const updateCondition = (index: number, updated: Condition | ConditionGroup) => {
    const newConditions = [...group.conditions]
    newConditions[index] = updated
    onChange({ ...group, conditions: newConditions })
  }

  const removeCondition = (index: number) => {
    const newConditions = group.conditions.filter((_, i) => i !== index)

    // If this would leave the group empty and it's not the root, remove the group itself
    if (newConditions.length === 0 && depth > 0 && onRemove) {
      onRemove()
    } else {
      onChange({ ...group, conditions: newConditions })
    }
  }

  const isRoot = depth === 0
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
