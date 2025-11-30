"use client"

import Link from "next/link"
import { getMediaTypeLabel } from "@/lib/utils/formatters"

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

interface RuleListProps {
  rules: MaintenanceRule[]
  onToggle: (id: string, currentEnabled: boolean) => void
  onManualScan: (id: string) => void
  onDeleteClick: (id: string) => void
  isTogglePending: boolean
  isScanPending: boolean
}

export function RuleList({
  rules,
  onToggle,
  onManualScan,
  onDeleteClick,
  isTogglePending,
  isScanPending,
}: RuleListProps) {
  function getActionTypeLabel(actionType: string) {
    switch (actionType) {
      case 'FLAG_FOR_REVIEW':
        return 'Flag for Review'
      case 'AUTO_DELETE':
        return 'Auto Delete'
      default:
        return actionType
    }
  }

  if (rules.length === 0) {
    return (
      <div className="text-center py-12 bg-slate-800/50 rounded-lg border border-slate-700">
        <svg className="w-12 h-12 text-slate-500 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
        <h3 className="text-lg font-medium text-white mb-2">No rules yet</h3>
        <p className="text-slate-400 mb-4">Create a maintenance rule to start automating library cleanup.</p>
        <Link
          href="/admin/maintenance/rules/new"
          className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg font-medium transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Create First Rule
        </Link>
      </div>
    )
  }

  return (
    <div className="bg-slate-800/50 rounded-lg border border-slate-700 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-slate-900/50 border-b border-slate-700">
              <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Rule Name</th>
              <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Media Type</th>
              <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Action</th>
              <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Status</th>
              <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Scans</th>
              <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Last Run</th>
              <th className="px-6 py-4 text-xs font-semibold text-slate-400 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700">
            {rules.map((rule) => {
              const lastScan = rule.scans[0]

              return (
                <tr key={rule.id} className="hover:bg-slate-800/50 transition-colors" data-testid={`rule-row-${rule.id}`}>
                  <td className="px-6 py-4">
                    <div>
                      <div className="text-sm font-medium text-white">{rule.name}</div>
                      {rule.description && (
                        <div className="text-xs text-slate-400 mt-1">{rule.description}</div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-400/10 text-blue-400">
                      {getMediaTypeLabel(rule.mediaType)}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      rule.actionType === 'AUTO_DELETE'
                        ? 'bg-red-400/10 text-red-400'
                        : 'bg-yellow-400/10 text-yellow-400'
                    }`}>
                      {getActionTypeLabel(rule.actionType)}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <button
                      onClick={() => onToggle(rule.id, rule.enabled)}
                      disabled={isTogglePending}
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors ${
                        rule.enabled
                          ? 'bg-green-400/10 text-green-400 hover:bg-green-400/20'
                          : 'bg-slate-400/10 text-slate-400 hover:bg-slate-400/20'
                      }`}
                      data-testid={`toggle-rule-${rule.id}`}
                    >
                      {rule.enabled ? 'Enabled' : 'Disabled'}
                    </button>
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-400">
                    {rule._count.scans} total
                    {lastScan && lastScan.itemsFlagged > 0 && (
                      <span className="ml-2 text-yellow-400">
                        ({lastScan.itemsFlagged} flagged)
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-slate-400">
                    {lastScan?.completedAt
                      ? new Date(lastScan.completedAt).toLocaleDateString()
                      : 'Never'
                    }
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => onManualScan(rule.id)}
                        disabled={!rule.enabled || isScanPending}
                        className="text-slate-400 hover:text-cyan-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Run Scan"
                        data-testid={`scan-rule-${rule.id}`}
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                      </button>
                      <Link
                        href={`/admin/maintenance/rules/${rule.id}/edit`}
                        className="text-slate-400 hover:text-white transition-colors"
                        title="Edit"
                        data-testid={`edit-rule-${rule.id}`}
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </Link>
                      <button
                        onClick={() => onDeleteClick(rule.id)}
                        className="text-slate-400 hover:text-red-400 transition-colors"
                        title="Delete"
                        data-testid={`delete-rule-${rule.id}`}
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
