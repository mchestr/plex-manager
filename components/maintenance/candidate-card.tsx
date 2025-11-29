"use client"

import type { CandidateWithDetails } from "@/types/maintenance"
import { formatFileSize, formatDate } from "@/lib/utils/formatters"
import { Film, Check, X } from "lucide-react"
import { Button } from "@/components/ui/button"

interface CandidateCardProps {
  candidate: CandidateWithDetails
  onApprove: (candidateId: string) => void
  onReject: (candidateId: string) => void
}

export function CandidateCard({ candidate, onApprove, onReject }: CandidateCardProps) {
  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4 hover:border-slate-600 transition-colors" data-testid="maintenance-candidate-card">
      <div className="flex gap-4">
        {/* Poster */}
        <div className="flex-shrink-0">
          {candidate.poster ? (
            <img
              src={candidate.poster}
              alt={candidate.title}
              className="w-24 h-36 object-cover rounded-lg"
            />
          ) : (
            <div className="w-24 h-36 bg-slate-700 rounded-lg flex items-center justify-center">
              <Film className="w-8 h-8 text-slate-500" />
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div>
              <h3 className="text-lg font-semibold text-white truncate">
                {candidate.title}
              </h3>
              {candidate.year && (
                <p className="text-sm text-slate-400">({candidate.year})</p>
              )}
            </div>
            <span className="text-xs px-2 py-1 bg-slate-700 text-slate-300 rounded whitespace-nowrap">
              {candidate.mediaType}
            </span>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <p className="text-xs text-slate-400">File Size</p>
              <p className="text-sm text-white font-medium">
                {formatFileSize(candidate.fileSize)}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Play Count</p>
              <p className="text-sm text-white font-medium">{candidate.playCount}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Last Watched</p>
              <p className="text-sm text-white font-medium">
                {formatDate(candidate.lastWatchedAt)}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Added</p>
              <p className="text-sm text-white font-medium">
                {formatDate(candidate.addedAt)}
              </p>
            </div>
          </div>

          {/* File Path */}
          {candidate.filePath && (
            <div className="mb-3">
              <p className="text-xs text-slate-400 mb-1">File Path</p>
              <p className="text-xs text-slate-300 font-mono bg-slate-900/50 p-2 rounded truncate">
                {candidate.filePath}
              </p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-2 mt-4">
            <Button
              variant="danger"
              onClick={() => onApprove(candidate.id)}
              className="flex-1"
              data-testid="maintenance-candidate-approve"
            >
              <Check className="w-4 h-4" />
              Approve for Deletion
            </Button>
            <Button
              variant="secondary"
              onClick={() => onReject(candidate.id)}
              className="flex-1"
              data-testid="maintenance-candidate-reject"
            >
              <X className="w-4 h-4" />
              Reject
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
