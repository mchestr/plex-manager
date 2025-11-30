"use client"

import { getMaintenanceCandidates, updateCandidateReviewStatus, bulkUpdateCandidates } from "@/actions/maintenance"
import { useToast } from "@/components/ui/toast"
import { LoadingSpinner } from "@/components/ui/loading-spinner"
import { Pagination } from "@/components/ui/pagination"
import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import type { ReviewStatus, MediaType } from "@/lib/validations/maintenance"
import type { PaginatedCandidatesResponse } from "@/types/maintenance"
import { CandidateList } from "@/components/admin/maintenance/candidates/CandidateList"
import { CandidateFilters } from "@/components/admin/maintenance/candidates/CandidateFilters"
import { CandidateActions } from "@/components/admin/maintenance/candidates/CandidateActions"

const DEFAULT_PAGE_SIZE = 25

export default function CandidatesPage() {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [selectedCandidates, setSelectedCandidates] = useState<Set<string>>(new Set())
  const [reviewStatusFilter, setReviewStatusFilter] = useState<ReviewStatus | "ALL">("PENDING")
  const [mediaTypeFilter, setMediaTypeFilter] = useState<MediaType | "ALL">("ALL")
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)

  const { data: candidatesResult, isLoading, error } = useQuery({
    queryKey: ['maintenance-candidates', reviewStatusFilter, mediaTypeFilter, page, pageSize],
    queryFn: async () => {
      const params: {
        page: number
        pageSize: number
        reviewStatus?: ReviewStatus
        mediaType?: MediaType
      } = {
        page,
        pageSize,
      }
      if (reviewStatusFilter !== "ALL") {
        params.reviewStatus = reviewStatusFilter
      }
      if (mediaTypeFilter !== "ALL") {
        params.mediaType = mediaTypeFilter
      }

      const result = await getMaintenanceCandidates(params)
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch candidates')
      }
      return result.data as PaginatedCandidatesResponse
    },
  })

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: ReviewStatus }) => {
      const result = await updateCandidateReviewStatus(id, status)
      if (!result.success) {
        throw new Error(result.error || 'Failed to update status')
      }
      return result
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance-candidates'] })
      toast.showSuccess('Status updated successfully')
    },
    onError: (error) => {
      toast.showError(error instanceof Error ? error.message : 'Failed to update status')
    },
  })

  const bulkUpdateMutation = useMutation({
    mutationFn: async ({ ids, status }: { ids: string[]; status: ReviewStatus }) => {
      const result = await bulkUpdateCandidates(ids, status)
      if (!result.success) {
        throw new Error(result.error || 'Failed to bulk update')
      }
      return result
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['maintenance-candidates'] })
      toast.showSuccess(`${variables.ids.length} candidates ${variables.status.toLowerCase()}`)
      setSelectedCandidates(new Set())
    },
    onError: (error) => {
      toast.showError(error instanceof Error ? error.message : 'Failed to bulk update')
    },
  })

  const candidates = candidatesResult?.candidates ?? []
  const pagination = candidatesResult?.pagination

  function handlePageChange(newPage: number) {
    setPage(newPage)
    setSelectedCandidates(new Set()) // Clear selection on page change
  }

  function handlePageSizeChange(newPageSize: number) {
    setPageSize(newPageSize)
    setPage(1) // Reset to first page when page size changes
    setSelectedCandidates(new Set())
  }

  function handleFilterChange(
    filterType: "reviewStatus" | "mediaType",
    value: ReviewStatus | MediaType | "ALL"
  ) {
    if (filterType === "reviewStatus") {
      setReviewStatusFilter(value as ReviewStatus | "ALL")
    } else {
      setMediaTypeFilter(value as MediaType | "ALL")
    }
    setPage(1) // Reset to first page when filters change
    setSelectedCandidates(new Set())
  }

  function toggleCandidate(id: string) {
    const newSelected = new Set(selectedCandidates)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    setSelectedCandidates(newSelected)
  }

  function toggleAll() {
    if (selectedCandidates.size === candidates.length && candidates.length > 0) {
      setSelectedCandidates(new Set())
    } else {
      setSelectedCandidates(new Set(candidates.map(c => c.id)))
    }
  }

  function handleApprove(id: string) {
    updateStatusMutation.mutate({ id, status: "APPROVED" })
  }

  function handleReject(id: string) {
    updateStatusMutation.mutate({ id, status: "REJECTED" })
  }

  function handleBulkApprove() {
    if (selectedCandidates.size === 0) return
    bulkUpdateMutation.mutate({ ids: Array.from(selectedCandidates), status: "APPROVED" })
  }

  function handleBulkReject() {
    if (selectedCandidates.size === 0) return
    bulkUpdateMutation.mutate({ ids: Array.from(selectedCandidates), status: "REJECTED" })
  }

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex justify-center py-12">
            <LoadingSpinner size="lg" />
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 sm:p-6">
        <div className="max-w-7xl mx-auto">
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
            <p className="text-red-400">Failed to load candidates</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white mb-2">Review Candidates</h1>
          <p className="text-slate-400">Review media flagged for deletion by maintenance rules</p>
        </div>

        <div className="bg-slate-800/50 rounded-lg border border-slate-700 p-4 mb-4">
          <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <CandidateFilters
              reviewStatusFilter={reviewStatusFilter}
              mediaTypeFilter={mediaTypeFilter}
              onReviewStatusChange={(value) => handleFilterChange("reviewStatus", value)}
              onMediaTypeChange={(value) => handleFilterChange("mediaType", value)}
            />
            <CandidateActions
              selectedCount={selectedCandidates.size}
              onBulkApprove={handleBulkApprove}
              onBulkReject={handleBulkReject}
              isPending={bulkUpdateMutation.isPending}
            />
          </div>
        </div>

        <CandidateList
          candidates={candidates}
          selectedCandidates={selectedCandidates}
          onToggleCandidate={toggleCandidate}
          onToggleAll={toggleAll}
          onApprove={handleApprove}
          onReject={handleReject}
          isPending={updateStatusMutation.isPending}
        />

        {pagination && pagination.totalCount > 0 && (
          <div className="bg-slate-800/50 rounded-lg border border-slate-700 mt-4">
            <Pagination
              page={pagination.page}
              pageSize={pagination.pageSize}
              totalCount={pagination.totalCount}
              totalPages={pagination.totalPages}
              hasNextPage={pagination.hasNextPage}
              hasPreviousPage={pagination.hasPreviousPage}
              onPageChange={handlePageChange}
              onPageSizeChange={handlePageSizeChange}
              className="px-4"
            />
          </div>
        )}
      </div>
    </div>
  )
}
