"use client"

import type { MaintenanceCandidate } from "@/types/maintenance"
import { StyledCheckbox } from "@/components/ui/styled-checkbox"
import { formatFileSize, formatDate, getMediaTypeLabel } from "@/lib/utils/formatters"
import { CheckCircle, Film, Check, X } from "lucide-react"
import { Button } from "@/components/ui/button"

interface CandidateListProps {
  candidates: MaintenanceCandidate[]
  selectedCandidates: Set<string>
  onToggleCandidate: (id: string) => void
  onToggleAll: () => void
  onApprove: (id: string) => void
  onReject: (id: string) => void
  isPending: boolean
}

export function CandidateList({
  candidates,
  selectedCandidates,
  onToggleCandidate,
  onToggleAll,
  onApprove,
  onReject,
  isPending,
}: CandidateListProps) {
  if (candidates.length === 0) {
    return (
      <div className="text-center py-12 bg-slate-800/50 rounded-lg border border-slate-700" data-testid="candidates-empty-state">
        <CheckCircle className="w-12 h-12 text-slate-500 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-white mb-2">No candidates found</h3>
        <p className="text-slate-400">No media matching the current filters.</p>
      </div>
    )
  }

  return (
    <div className="bg-slate-800/50 rounded-lg border border-slate-700 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-slate-900/50 border-b border-slate-700">
              <th className="px-6 py-4">
                <StyledCheckbox
                  checked={selectedCandidates.size === candidates.length && candidates.length > 0}
                  onChange={onToggleAll}
                  data-testid="select-all-candidates"
                />
              </th>
              <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Media</th>
              <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Type</th>
              <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">File Size</th>
              <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Play Count</th>
              <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Last Watched</th>
              <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Matched Rule</th>
              <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
              <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700">
            {candidates.map((candidate) => (
              <tr key={candidate.id} className="hover:bg-slate-800/50 transition-colors" data-testid={`candidate-row-${candidate.id}`}>
                <td className="px-6 py-4">
                  <StyledCheckbox
                    checked={selectedCandidates.has(candidate.id)}
                    onChange={() => onToggleCandidate(candidate.id)}
                    data-testid={`select-candidate-${candidate.id}`}
                  />
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    {candidate.poster ? (
                      <img
                        src={candidate.poster}
                        alt={candidate.title}
                        className="w-10 h-14 object-cover rounded"
                      />
                    ) : (
                      <div className="w-10 h-14 bg-slate-700 rounded flex items-center justify-center">
                        <Film className="w-5 h-5 text-slate-500" />
                      </div>
                    )}
                    <div>
                      <div className="text-sm font-medium text-white">{candidate.title}</div>
                      {candidate.year && (
                        <div className="text-xs text-slate-400">{candidate.year}</div>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-400/10 text-blue-400">
                    {getMediaTypeLabel(candidate.mediaType)}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-slate-400">
                  {formatFileSize(candidate.fileSize)}
                </td>
                <td className="px-6 py-4 text-sm text-slate-400">
                  {candidate.playCount}
                </td>
                <td className="px-6 py-4 text-sm text-slate-400">
                  {formatDate(candidate.lastWatchedAt)}
                </td>
                <td className="px-6 py-4">
                  <div className="text-sm text-white">{candidate.scan.rule.name}</div>
                  <div className={`text-xs mt-1 ${
                    candidate.scan.rule.actionType === 'AUTO_DELETE'
                      ? 'text-red-400'
                      : 'text-yellow-400'
                  }`}>
                    {candidate.scan.rule.actionType === 'AUTO_DELETE' ? 'Auto Delete' : 'Flag for Review'}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    candidate.reviewStatus === 'APPROVED' ? 'bg-green-400/10 text-green-400' :
                    candidate.reviewStatus === 'REJECTED' ? 'bg-red-400/10 text-red-400' :
                    candidate.reviewStatus === 'DELETED' ? 'bg-slate-400/10 text-slate-400' :
                    'bg-yellow-400/10 text-yellow-400'
                  }`}>
                    {candidate.reviewStatus}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    {candidate.reviewStatus === 'PENDING' && (
                      <>
                        <Button
                          onClick={() => onApprove(candidate.id)}
                          disabled={isPending}
                          variant="ghost"
                          size="sm"
                          className="text-green-400 hover:text-green-300"
                          title="Approve"
                          aria-label="Approve"
                          data-testid={`approve-candidate-${candidate.id}`}
                        >
                          <Check className="w-5 h-5" />
                        </Button>
                        <Button
                          onClick={() => onReject(candidate.id)}
                          disabled={isPending}
                          variant="ghost"
                          size="sm"
                          className="text-red-400 hover:text-red-300"
                          title="Reject"
                          aria-label="Reject"
                          data-testid={`reject-candidate-${candidate.id}`}
                        >
                          <X className="w-5 h-5" />
                        </Button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
