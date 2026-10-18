import { LLM_TEXT_REMOVED_NOTICE } from "@/lib/wrapped/maintenance/strip-rosters"

/** Stands in for LLM prompt or response text that the October 2026 clean-up removed (P0.20). */
export function LlmTextRemovedNotice({ title }: { title: string }) {
  return (
    <div
      data-testid="llm-text-removed-notice"
      className="bg-slate-800/50 backdrop-blur-sm border border-slate-700 rounded-lg p-6 mb-6"
    >
      <h2 className="text-lg font-semibold text-white mb-2">{title}</h2>
      <p className="text-sm text-slate-400">{LLM_TEXT_REMOVED_NOTICE}</p>
    </div>
  )
}
