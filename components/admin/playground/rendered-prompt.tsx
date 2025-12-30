"use client"

import { Button } from "@/components/ui/button"

interface RenderedPromptProps {
  renderedPrompt: string
  isExpanded: boolean
  onToggle: () => void
}

export function RenderedPrompt({
  renderedPrompt,
  isExpanded,
  onToggle,
}: RenderedPromptProps) {
  return (
    <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6 shadow-lg shadow-slate-900/20">
      <div className="mb-5 flex-shrink-0">
        <Button
          type="button"
          onClick={onToggle}
          variant="ghost"
          className="w-full flex items-center justify-between text-sm font-semibold text-white mb-2 hover:text-slate-200"
        >
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span>Rendered Prompt</span>
          </div>
          <svg
            className={`w-5 h-5 transition-transform ${isExpanded ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </Button>
        <p className="text-xs text-slate-400 leading-relaxed">
          The prompt with all placeholders replaced with actual data
        </p>
      </div>
      {isExpanded && (
        <div className="bg-slate-900/50 border border-slate-700/50 rounded-lg p-5 max-h-96 overflow-y-auto">
          <pre className="text-xs text-slate-300 whitespace-pre-wrap font-mono leading-relaxed">
            {renderedPrompt}
          </pre>
        </div>
      )}
    </div>
  )
}

