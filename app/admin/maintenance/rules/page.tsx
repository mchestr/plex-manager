"use client"

import { getMaintenanceRules, deleteMaintenanceRule, toggleMaintenanceRule, triggerManualScan } from "@/actions/maintenance"
import { useToast } from "@/components/ui/toast"
import { ConfirmModal } from "@/components/admin/shared/confirm-modal"
import { LoadingSpinner } from "@/components/ui/loading-spinner"
import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { RuleList } from "@/components/admin/maintenance/rules/RuleList"
import { RuleActions } from "@/components/admin/maintenance/rules/RuleActions"

type MaintenanceRule = {
  id: string
  name: string
  description: string | null
  enabled: boolean
  mediaType: string
  actionType: string
  schedule: string | null
  createdAt: Date
  scans: Array<{
    id: string
    status: string
    itemsScanned: number
    itemsFlagged: number
    completedAt: Date | null
  }>
  _count: {
    scans: number
  }
}

export default function RulesPage() {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [ruleIdToDelete, setRuleIdToDelete] = useState<string | null>(null)

  const { data: rulesResult, isLoading, error } = useQuery({
    queryKey: ['maintenance-rules'],
    queryFn: async () => {
      const result = await getMaintenanceRules()
      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch rules')
      }
      return result.data as MaintenanceRule[]
    },
  })

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const result = await deleteMaintenanceRule(id)
      if (!result.success) {
        throw new Error(result.error || 'Failed to delete rule')
      }
      return result
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['maintenance-rules'] })
      toast.showSuccess('Rule deleted successfully')
      setRuleIdToDelete(null)
    },
    onError: (error) => {
      toast.showError(error instanceof Error ? error.message : 'Failed to delete rule')
    },
  })

  const toggleMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      const result = await toggleMaintenanceRule(id, enabled)
      if (!result.success) {
        throw new Error(result.error || 'Failed to toggle rule')
      }
      return result
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['maintenance-rules'] })
      toast.showSuccess(variables.enabled ? 'Rule enabled' : 'Rule disabled')
    },
    onError: (error) => {
      toast.showError(error instanceof Error ? error.message : 'Failed to toggle rule')
    },
  })

  const scanMutation = useMutation({
    mutationFn: async (id: string) => {
      const result = await triggerManualScan(id)
      if (!result.success) {
        throw new Error(result.error || 'Failed to trigger scan')
      }
      return result
    },
    onSuccess: () => {
      toast.showSuccess('Scan queued successfully')
      queryClient.invalidateQueries({ queryKey: ['maintenance-rules'] })
    },
    onError: (error) => {
      toast.showError(error instanceof Error ? error.message : 'Failed to trigger scan')
    },
  })

  function handleDeleteClick(id: string) {
    setRuleIdToDelete(id)
  }

  function handleDeleteConfirm() {
    if (ruleIdToDelete) {
      deleteMutation.mutate(ruleIdToDelete)
    }
  }

  function handleToggle(id: string, currentEnabled: boolean) {
    toggleMutation.mutate({ id, enabled: !currentEnabled })
  }

  function handleManualScan(id: string) {
    scanMutation.mutate(id)
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
            <p className="text-red-400">Failed to load maintenance rules</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white mb-2">Maintenance Rules</h1>
            <p className="text-slate-400">Configure automated library maintenance rules</p>
          </div>
          <RuleActions />
        </div>

        <RuleList
          rules={rulesResult || []}
          onToggle={handleToggle}
          onManualScan={handleManualScan}
          onDeleteClick={handleDeleteClick}
          isTogglePending={toggleMutation.isPending}
          isScanPending={scanMutation.isPending}
        />

        <ConfirmModal
          isOpen={ruleIdToDelete !== null}
          onClose={() => setRuleIdToDelete(null)}
          onConfirm={handleDeleteConfirm}
          title="Delete Maintenance Rule"
          message="Are you sure you want to delete this rule? This will also delete all associated scans and candidates. This action cannot be undone."
          confirmText="Delete"
          cancelText="Cancel"
          confirmButtonClass="bg-red-600 hover:bg-red-700"
        />
      </div>
    </div>
  )
}
