"use client"

import type { MediaItem } from "@/lib/maintenance/rule-evaluator"
import type { RuleCriteria } from "@/lib/validations/maintenance"
import { evaluateRuleWithDetails, type ConditionResult } from "@/lib/maintenance/client-evaluator"
import { useMemo } from "react"

interface RulePreviewPanelProps {
  criteria: RuleCriteria
  selectedItem: MediaItem | null
}

export function RulePreviewPanel({ criteria, selectedItem }: RulePreviewPanelProps) {
  const evaluationResult = useMemo(() => {
    if (!selectedItem) return null
    return evaluateRuleWithDetails(selectedItem, criteria)
  }, [criteria, selectedItem])

  if (!selectedItem) {
    return (
      <div className="bg-slate-800/50 rounded-lg border border-slate-700 p-4" data-testid="rule-preview-panel">
        <div className="text-center py-6 text-slate-500 text-sm">
          <svg className="w-10 h-10 mx-auto mb-2 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
          <p>Select media to see evaluation</p>
        </div>
      </div>
    )
  }

  const matches = evaluationResult?.matches ?? false
  const conditionResults = evaluationResult?.conditionResults ?? []
  const passedCount = conditionResults.filter(r => r.passed).length

  return (
    <div className="bg-slate-800/50 rounded-lg border border-slate-700 p-4" data-testid="rule-preview-panel">
      {/* Result header */}
      <div className={`flex items-center justify-between p-3 rounded-lg mb-4 ${
        matches ? 'bg-green-900/20' : 'bg-red-900/20'
      }`} data-testid="rule-preview-result">
        <div className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded-full ${matches ? 'bg-green-400' : 'bg-red-400'}`} />
          <span className={`text-sm font-medium ${matches ? 'text-green-400' : 'text-red-400'}`}>
            {matches ? 'Would be flagged' : 'Would NOT be flagged'}
          </span>
        </div>
        <span className="text-xs text-slate-500">
          {passedCount}/{conditionResults.length} pass
        </span>
      </div>

      {/* Condition results */}
      {conditionResults.length === 0 ? (
        <div className="text-sm text-slate-500 text-center py-4">
          No conditions to evaluate
        </div>
      ) : (
        <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
          {conditionResults.map((result, index) => (
            <ConditionResultRow key={index} result={result} />
          ))}
        </div>
      )}
    </div>
  )
}

interface ConditionResultRowProps {
  result: ConditionResult
}

function ConditionResultRow({ result }: ConditionResultRowProps) {
  const formatValue = (value: unknown): string => {
    if (value === null || value === undefined) return 'null'
    if (value instanceof Date) return value.toLocaleDateString()
    if (typeof value === 'boolean') return value ? 'true' : 'false'
    if (Array.isArray(value)) {
      if (value.length === 0) return '(empty)'
      if (value.length > 3) return `${value.slice(0, 3).join(', ')}...`
      return value.join(', ')
    }
    if (typeof value === 'object') return JSON.stringify(value)
    const str = String(value)
    return str.length > 20 ? str.slice(0, 20) + '...' : str
  }

  // Format operator to be more readable
  const formatOperator = (op: string): string => {
    const opMap: Record<string, string> = {
      equals: '=',
      notEquals: '≠',
      contains: 'contains',
      notContains: '!contains',
      greaterThan: '>',
      greaterThanOrEqual: '≥',
      lessThan: '<',
      lessThanOrEqual: '≤',
      olderThan: 'older than',
      newerThan: 'newer than',
      null: 'is null',
      notNull: 'is not null',
    }
    return opMap[op] || op
  }

  return (
    <div className={`
      flex items-center gap-2 px-3 py-2 rounded-lg text-xs
      ${result.passed
        ? 'bg-green-900/10 border border-green-500/20'
        : 'bg-red-900/10 border border-red-500/20'
      }
    `}>
      {/* Pass/fail indicator */}
      <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${result.passed ? 'bg-green-400' : 'bg-red-400'}`} />

      {/* Field and condition */}
      <div className="flex-1 min-w-0">
        <span className="text-slate-300">{result.fieldLabel}</span>
        <span className="text-cyan-400 mx-1">{formatOperator(result.operator)}</span>
        <span className="text-slate-400 font-mono">{formatValue(result.expectedValue)}</span>
      </div>

      {/* Actual value (on hover/always shown for failed) */}
      {!result.passed && (
        <div className="text-slate-500 flex-shrink-0">
          got: <span className="font-mono text-red-300">{formatValue(result.actualValue)}</span>
        </div>
      )}
    </div>
  )
}
