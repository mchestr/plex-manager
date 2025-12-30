"use client"

import { useState, useTransition } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { JobMetadata, JobStatus } from "@/lib/queue/types"
import { retryQueueJob, removeQueueJob } from "@/actions/admin/queue"
import { useToast } from "@/components/ui/toast"

interface JobTableProps {
  jobs: JobMetadata[]
  page: number
  hasMore: boolean
  disabled?: boolean
}

const STATUS_COLORS: Record<JobStatus, string> = {
  waiting: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  active: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  completed: "bg-green-500/20 text-green-400 border-green-500/30",
  failed: "bg-red-500/20 text-red-400 border-red-500/30",
  delayed: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  prioritized: "bg-purple-500/20 text-purple-400 border-purple-500/30",
  "waiting-children": "bg-orange-500/20 text-orange-400 border-orange-500/30",
}

export function JobTable({ jobs, page, hasMore, disabled = false }: JobTableProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { showSuccess, showError } = useToast()
  const [pendingJobId, setPendingJobId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const formatTime = (date: Date | undefined) => {
    if (!date) return "-"
    const d = new Date(date)
    return d.toLocaleString()
  }

  const formatDuration = (start: Date | undefined, end: Date | undefined) => {
    if (!start || !end) return "-"
    const startTime = new Date(start).getTime()
    const endTime = new Date(end).getTime()
    const durationMs = endTime - startTime
    if (durationMs < 1000) return `${durationMs}ms`
    if (durationMs < 60000) return `${(durationMs / 1000).toFixed(1)}s`
    return `${(durationMs / 60000).toFixed(1)}m`
  }

  const formatJobType = (type: string) => {
    // Convert "watchlist:sync:user" to "Watchlist Sync (User)"
    return type
      .split(":")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ")
      .replace(/^(\w+) (\w+) (\w+)$/, "$1 $2 ($3)")
  }

  const handleRetry = async (jobId: string) => {
    setPendingJobId(jobId)
    startTransition(async () => {
      const result = await retryQueueJob({ jobId })
      if (result.success) {
        showSuccess("Job retried")
        router.refresh()
      } else {
        showError(result.error || "Failed to retry")
      }
      setPendingJobId(null)
    })
  }

  const handleRemove = async (jobId: string) => {
    setPendingJobId(jobId)
    startTransition(async () => {
      const result = await removeQueueJob({ jobId })
      if (result.success) {
        showSuccess("Job removed")
        router.refresh()
      } else {
        showError(result.error || "Failed to remove")
      }
      setPendingJobId(null)
    })
  }

  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set("page", newPage.toString())
    router.push(`?${params.toString()}`)
  }

  if (jobs.length === 0) {
    return (
      <div className="p-8 text-center text-slate-400">
        <svg
          className="w-12 h-12 mx-auto mb-4 text-slate-600"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
          />
        </svg>
        <p>No jobs found</p>
        <p className="text-sm text-slate-500 mt-1">
          Jobs will appear here when they are added to the queue
        </p>
      </div>
    )
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-700/30 border-b border-slate-700">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                Job ID
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                Type
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                Created
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                Duration
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                Attempts
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700">
            {jobs.map((job) => (
              <tr
                key={job.jobId}
                className="hover:bg-slate-700/20 transition-colors"
                data-testid={`job-row-${job.jobId}`}
              >
                <td className="px-4 py-3">
                  <span className="font-mono text-xs text-slate-300 truncate max-w-[200px] inline-block">
                    {job.jobId}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-sm text-slate-300">
                    {formatJobType(job.jobType)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`px-2 py-1 text-xs font-medium rounded border ${
                      STATUS_COLORS[job.status] ?? STATUS_COLORS.waiting
                    }`}
                  >
                    {job.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-sm text-slate-400">
                    {formatTime(job.createdAt)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-sm text-slate-400">
                    {formatDuration(job.startedAt, job.finishedAt)}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-sm text-slate-400">
                    {job.attempts}/{job.maxAttempts}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    {job.status === "failed" && (
                      <button
                        onClick={() => handleRetry(job.jobId)}
                        disabled={disabled || (isPending && pendingJobId === job.jobId)}
                        className="p-1 text-cyan-400 hover:text-cyan-300 disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Retry job"
                        data-testid={`job-retry-${job.jobId}`}
                      >
                        {isPending && pendingJobId === job.jobId ? (
                          <svg
                            className="w-4 h-4 animate-spin"
                            fill="none"
                            viewBox="0 0 24 24"
                          >
                            <circle
                              className="opacity-25"
                              cx="12"
                              cy="12"
                              r="10"
                              stroke="currentColor"
                              strokeWidth="4"
                            />
                            <path
                              className="opacity-75"
                              fill="currentColor"
                              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                            />
                          </svg>
                        ) : (
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                            />
                          </svg>
                        )}
                      </button>
                    )}
                    <button
                      onClick={() => handleRemove(job.jobId)}
                      disabled={
                        disabled ||
                        (isPending && pendingJobId === job.jobId) ||
                        job.status === "active"
                      }
                      className="p-1 text-red-400 hover:text-red-300 disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Remove job"
                      data-testid={`job-remove-${job.jobId}`}
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="px-4 py-3 border-t border-slate-700 flex items-center justify-between">
        <button
          onClick={() => handlePageChange(page - 1)}
          disabled={page <= 1}
          className="px-3 py-1 text-sm text-slate-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
          data-testid="job-table-prev"
        >
          Previous
        </button>
        <span className="text-sm text-slate-400">Page {page}</span>
        <button
          onClick={() => handlePageChange(page + 1)}
          disabled={!hasMore}
          className="px-3 py-1 text-sm text-slate-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
          data-testid="job-table-next"
        >
          Next
        </button>
      </div>
    </>
  )
}
