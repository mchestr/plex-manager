"use client"

/**
 * Single Condition Builder
 *
 * UI for building a single field comparison (leaf node in the rule tree).
 */

import type { Condition, MediaType } from "@/lib/validations/maintenance"
import type { FieldDefinition } from "@/lib/maintenance/field-registry"
import { formatOperatorLabel, getFieldsByDataSource } from "@/lib/maintenance/field-registry"
import { ConditionValueInput } from "./condition-value-input"
import { StyledDropdown } from "@/components/ui/styled-dropdown"
import type { DropdownOptGroup } from "@/components/ui/styled-dropdown"
import { useMemo } from "react"

interface ConditionBuilderProps {
  condition: Condition
  onChange: (condition: Condition) => void
  onRemove: () => void
  availableFields: FieldDefinition[]
  mediaType: MediaType
}

export function ConditionBuilder({
  condition,
  onChange,
  onRemove,
  availableFields,
  mediaType,
}: ConditionBuilderProps) {
  const fieldDef = useMemo(
    () => availableFields.find(f => f.key === condition.field),
    [availableFields, condition.field]
  )

  const fieldsByDataSource = useMemo(
    () => getFieldsByDataSource(mediaType),
    [mediaType]
  )

  const fieldOptgroups: DropdownOptGroup[] = useMemo(() => {
    const sourceLabels: Record<string, string> = {
      plex: 'Plex',
      tautulli: 'Tautulli',
      radarr: 'Radarr',
      sonarr: 'Sonarr',
    }

    return Object.entries(fieldsByDataSource)
      .filter(([_, fields]) => fields.length > 0)
      .map(([dataSource, fields]) => ({
        label: sourceLabels[dataSource] || dataSource,
        options: fields.map(f => ({
          value: f.key,
          label: f.description ? `${f.label} - ${f.description}` : f.label,
        })),
      }))
  }, [fieldsByDataSource])

  const operatorOptions = useMemo(() => {
    if (!fieldDef) return []
    return fieldDef.allowedOperators.map(op => ({
      value: op,
      label: formatOperatorLabel(op),
    }))
  }, [fieldDef])

  if (!fieldDef) {
    return (
      <div className="p-3 bg-red-500/10 border border-red-500/30 rounded text-red-400 text-sm">
        Unknown field: {condition.field}
      </div>
    )
  }

  const handleFieldChange = (newFieldKey: string) => {
    const newFieldDef = availableFields.find(f => f.key === newFieldKey)
    if (!newFieldDef) return

    onChange({
      ...condition,
      field: newFieldKey,
      operator: newFieldDef.allowedOperators[0],
      value: null,
      valueUnit: undefined,
    })
  }

  const handleOperatorChange = (newOperator: string) => {
    onChange({
      ...condition,
      operator: newOperator,
      value: null,
    })
  }

  return (
    <div className="p-4 bg-slate-800/50 border border-slate-700 rounded-lg hover:border-slate-600 transition-colors space-y-3">
      {/* Row 1: Field selector with remove button */}
      <div className="flex items-center gap-3">
        <div className="flex-1">
          <label className="block text-xs text-slate-500 mb-1.5">Field</label>
          <StyledDropdown
            value={condition.field}
            onChange={handleFieldChange}
            optgroups={fieldOptgroups}
            size="md"
          />
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="text-red-400 hover:text-red-300 p-2 rounded hover:bg-red-400/10 transition-colors flex-shrink-0 mt-5"
          title="Remove condition"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Row 2: Operator and Value */}
      <div className="flex items-end gap-3">
        <div className="w-[180px] flex-shrink-0">
          <label className="block text-xs text-slate-500 mb-1.5">Operator</label>
          <StyledDropdown
            value={condition.operator}
            onChange={handleOperatorChange}
            options={operatorOptions}
            size="md"
          />
        </div>
        <div className="flex-1">
          <label className="block text-xs text-slate-500 mb-1.5">Value</label>
          <ConditionValueInput
            fieldDef={fieldDef}
            condition={condition}
            onChange={onChange}
          />
        </div>
      </div>
    </div>
  )
}
