"use client"

import { DEFAULT_OPENAI_MODEL } from "@/lib/llm/openai-params"

interface CostDisplayProps {
  tokenUsage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
    cost: number
  }
  configuredModel: string
  selectedModel?: string
}

export function CostDisplay({
  tokenUsage,
  configuredModel,
  selectedModel,
}: CostDisplayProps) {
  // Only show if we have actual usage
  if (!tokenUsage) {
    return null
  }

  const model = selectedModel || configuredModel || DEFAULT_OPENAI_MODEL

  return (
    <div className="bg-gradient-to-r from-green-500/10 to-emerald-500/10 border border-green-500/30 rounded-xl p-6 shadow-lg shadow-slate-900/20 mt-8">
      <div className="flex items-center gap-2 mb-4">
        <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <h3 className="text-sm font-semibold text-white">Actual Cost</h3>
      </div>

      <div className="bg-slate-800/50 rounded-lg p-4 border border-green-500/20">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-green-400"></div>
            <h4 className="text-xs font-semibold text-white">Cost</h4>
          </div>
          <div className="text-lg font-bold text-green-400">
            ${tokenUsage.cost.toFixed(4)}
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
          <div>
            <div className="text-slate-400 mb-0.5">Model</div>
            <div className="text-slate-300 font-medium">{model}</div>
          </div>
          <div>
            <div className="text-slate-400 mb-0.5">Prompt Tokens</div>
            <div className="text-lg font-semibold text-cyan-400">
              {tokenUsage.promptTokens.toLocaleString()}
            </div>
          </div>
          <div>
            <div className="text-slate-400 mb-0.5">Completion Tokens</div>
            <div className="text-lg font-semibold text-purple-400">
              {tokenUsage.completionTokens.toLocaleString()}
            </div>
          </div>
          <div>
            <div className="text-slate-400 mb-0.5">Total Tokens</div>
            <div className="text-lg font-semibold text-white">
              {tokenUsage.totalTokens.toLocaleString()}
            </div>
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-slate-700">
          <div className="text-xs text-slate-400">
            ✓ This cost has been recorded in the cost analysis dashboard
          </div>
        </div>
      </div>
    </div>
  )
}

