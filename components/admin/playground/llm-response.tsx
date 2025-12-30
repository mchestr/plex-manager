"use client"

import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/sonner"
import { useEffect } from "react"

interface LLMResponseProps {
  llmResponse: string
  onPreview: () => void
  onSave: () => void
  isSaving: boolean
  saveError: string | null
  previewError: string | null
}

export function LLMResponse({
  llmResponse,
  onPreview,
  onSave,
  isSaving,
  saveError,
  previewError,
}: LLMResponseProps) {
  const toast = useToast()

  useEffect(() => {
    if (saveError) {
      toast.showError(saveError)
    }
  }, [saveError, toast])

  useEffect(() => {
    if (previewError) {
      toast.showError(previewError)
    }
  }, [previewError, toast])

  return (
    <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6 shadow-lg shadow-slate-900/20">
      <div className="mb-5 flex-shrink-0">
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <svg className="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                LLM Response
              </h3>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              The AI-generated response containing the wrapped data
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              onClick={onPreview}
              variant="primary"
              size="sm"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              Preview
            </Button>
            <Button
              onClick={onSave}
              disabled={isSaving}
              variant="success"
              size="sm"
            >
              {isSaving ? (
                <>
                  <svg className="animate-spin h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Saving...
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Save as Wrapped
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
      <div className="bg-slate-900/50 border border-slate-700/50 rounded-lg p-5 max-h-96 overflow-y-auto">
        <pre className="text-xs text-slate-300 whitespace-pre-wrap font-mono leading-relaxed">
          {llmResponse}
        </pre>
      </div>
    </div>
  )
}

