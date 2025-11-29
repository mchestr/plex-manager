"use client"

import { WrappedViewerWrapper } from "@/components/wrapped/wrapped-viewer-wrapper"
import { WrappedData } from "@/types/wrapped"
import { createPortal } from "react-dom"

interface PreviewModalProps {
  show: boolean
  wrappedData: WrappedData | null
  userName: string
  year: number
  onClose: () => void
  onSave: () => void
  isSaving: boolean
  saveError: string | null
  canSave: boolean
}

export function PreviewModal({
  show,
  wrappedData,
  userName,
  year,
  onClose,
  onSave,
  isSaving,
  saveError,
  canSave,
}: PreviewModalProps) {
  if (!show || !wrappedData || typeof window === "undefined") {
    return null
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] bg-black/90 backdrop-blur-sm overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="preview-modal-title"
      aria-describedby="preview-modal-description"
    >
      {/* Preview Header Banner */}
      <div className="bg-slate-900/90 backdrop-blur-sm border-b border-slate-700 px-6 py-4 sticky top-0 z-[10000]">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h2 id="preview-modal-title" className="text-xl font-bold text-white">
              Preview: {userName}&apos;s {year} Wrapped
            </h2>
            <p id="preview-modal-description" className="text-sm text-slate-400 mt-1">
              This is a preview. Use the buttons below to save or go back to the playground.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onSave}
              disabled={isSaving || !canSave}
              aria-busy={isSaving}
              className="px-4 py-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white rounded-lg font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 backdrop-blur-sm"
            >
              {isSaving ? (
                <>
                  <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Saving...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Save as Wrapped
                </>
              )}
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-800/90 hover:bg-slate-700 border border-slate-600 text-white rounded-lg font-medium transition-all flex items-center gap-2 backdrop-blur-sm"
              aria-label="Back to playground"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Back to Playground
            </button>
          </div>
        </div>
        {saveError && (
          <div role="alert" className="mt-3 bg-red-500/10 border border-red-500/50 text-red-400 px-3 py-2 rounded-lg text-sm">
            {saveError}
          </div>
        )}
      </div>

      {/* Wrapped Preview Content */}
      <div className="min-h-screen">
        <WrappedViewerWrapper
          wrappedData={wrappedData}
          year={year}
          isShared={false}
          userName={userName}
        />
      </div>
    </div>,
    document.body
  )
}

