"use client"

import type { ReviewStatus, MediaType } from "@/lib/validations/maintenance"
import { StyledDropdown } from "@/components/ui/styled-dropdown"

interface CandidateFiltersProps {
  reviewStatusFilter: ReviewStatus | "ALL"
  mediaTypeFilter: MediaType | "ALL"
  onReviewStatusChange: (status: ReviewStatus | "ALL") => void
  onMediaTypeChange: (type: MediaType | "ALL") => void
}

export function CandidateFilters({
  reviewStatusFilter,
  mediaTypeFilter,
  onReviewStatusChange,
  onMediaTypeChange,
}: CandidateFiltersProps) {
  return (
    <div className="flex gap-3 flex-wrap">
      <div>
        <label className="text-xs text-slate-400 mb-1 block">Review Status</label>
        <StyledDropdown
          value={reviewStatusFilter}
          onChange={(value) => onReviewStatusChange(value as ReviewStatus | "ALL")}
          options={[
            { value: "ALL", label: "All Status" },
            { value: "PENDING", label: "Pending" },
            { value: "APPROVED", label: "Approved" },
            { value: "REJECTED", label: "Rejected" },
          ]}
          size="md"
          data-testid="review-status-filter"
        />
      </div>

      <div>
        <label className="text-xs text-slate-400 mb-1 block">Media Type</label>
        <StyledDropdown
          value={mediaTypeFilter}
          onChange={(value) => onMediaTypeChange(value as MediaType | "ALL")}
          options={[
            { value: "ALL", label: "All Types" },
            { value: "MOVIE", label: "Movie" },
            { value: "TV_SERIES", label: "TV Series" },
            { value: "EPISODE", label: "Episode" },
          ]}
          size="md"
          data-testid="media-type-filter"
        />
      </div>
    </div>
  )
}
