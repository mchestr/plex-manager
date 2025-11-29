"use client"

import { Button } from "@/components/ui/button"
import { Check, X } from "lucide-react"

interface CandidateActionsProps {
  selectedCount: number
  onBulkApprove: () => void
  onBulkReject: () => void
  isPending: boolean
}

export function CandidateActions({
  selectedCount,
  onBulkApprove,
  onBulkReject,
  isPending,
}: CandidateActionsProps) {
  return (
    <div className={`flex gap-2 ${selectedCount === 0 ? 'hidden' : ''}`}>
      <Button
        onClick={onBulkApprove}
        disabled={isPending}
        variant="success"
        size="md"
        data-testid="bulk-approve-button"
      >
        <Check className="w-4 h-4" />
        Approve ({selectedCount})
      </Button>
      <Button
        onClick={onBulkReject}
        disabled={isPending}
        variant="danger"
        size="md"
        data-testid="bulk-reject-button"
      >
        <X className="w-4 h-4" />
        Reject ({selectedCount})
      </Button>
    </div>
  )
}
