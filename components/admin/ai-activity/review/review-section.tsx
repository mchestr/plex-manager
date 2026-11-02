"use client"

import { useQuery, useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import { useEffect, useTransition } from "react"

import { getConversationReviewStatus, reviewConversation } from "@/actions/admin/conversation-review"
import { FindingCard, type ReviewFinding } from "@/components/admin/ai-activity/review/finding-card"
import { Alert } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "@/components/ui/status-badge"
import { useToast } from "@/components/ui/toast"
import { queryKeys } from "@/hooks/query-keys"
import type { ReviewView } from "@/lib/data/conversation-review"
import { useFormat } from "@/lib/format-context"
import type { ConversationReviewStatus } from "@/lib/generated/prisma/client"
import { reviewErrorCopy } from "@/lib/ui/review-error-copy"

const POLL_MS = 5_000

type ReviewStatus = { reviewId: string; status: ConversationReviewStatus; errorCode: string | null }

const isPending = (status: ReviewStatus | null | undefined) => status?.status === "queued" || status?.status === "running"
const polling = (query: { state: { data?: ReviewStatus | null } }) => isPending(query.state.data)

/**
 * The latest review's status, seeded from the page. Only the 5 s poll calls
 * the action, and only while the review is queued or running: the action
 * refreshes the page once it reads done or failed, so the poll stops there.
 * `enabled` is a function of the query, so `setQueryData` after Review starts
 * the poll without an immediate call. A failed call is not retried and stops
 * the poll until the admin retries it. A refreshed page whose review is not
 * the cached one (another admin or the nightly sweep started it) reseeds it.
 */
function useReviewStatus(conversationId: string, review: ReviewView | null) {
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: queryKeys.conversationReview(conversationId),
    queryFn: async () => {
      const result = await getConversationReviewStatus({ conversationId })
      if (!result.success) throw new Error(result.error)
      return result.data
    },
    initialData: review ? { reviewId: review.id, status: review.status, errorCode: review.errorCode } : null,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    retry: false,
    enabled: polling,
    refetchInterval: (query) => (query.state.status !== "error" && polling(query) ? POLL_MS : false),
  })

  const reviewId = review?.id
  const reviewStatus = review?.status
  const reviewErrorCode = review?.errorCode ?? null
  useEffect(() => {
    if (reviewId === undefined || reviewStatus === undefined) return
    const key = queryKeys.conversationReview(conversationId)
    if (queryClient.getQueryData<ReviewStatus | null>(key)?.reviewId === reviewId) return
    const seed: ReviewStatus = { reviewId, status: reviewStatus, errorCode: reviewErrorCode }
    queryClient.setQueryData<ReviewStatus | null>(key, seed)
  }, [queryClient, conversationId, reviewId, reviewStatus, reviewErrorCode])

  return { status: query.data, failed: query.isError, retry: () => void query.refetch() }
}

/** A failure's fixed copy, then its settings link when it has one. */
function FailureCopy({ code }: { code: string | null }) {
  const copy = reviewErrorCopy(code)
  return (
    <>
      {copy.message}
      {copy.link && (
        <>
          {" "}
          <Link href={copy.link.href} className="underline underline-offset-3" data-testid="conversation-review-settings-link">
            {copy.link.label}
          </Link>
        </>
      )}
    </>
  )
}

/** What the status region says: the review's progress, and its result once the page shows it. A failure is the Alert's to say. */
function announcement(status: ReviewStatus | null | undefined, finished: boolean, findings: number): string {
  if (status?.status === "queued") return "Review queued"
  if (status?.status === "running") return "Reviewing the conversation"
  if (!finished) return ""
  return `Review finished, ${findings === 0 ? "no findings" : findings === 1 ? "1 finding" : `${findings} findings`}`
}

/** When the review finished, its model and cost, then its summary. */
function ReviewDetails({ review }: { review: ReviewView }) {
  const f = useFormat()
  return (
    <div className="flex flex-col gap-1">
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-caption text-muted-foreground">
        {review.completedAt && <span>Reviewed {f.dateTime(review.completedAt, { zoneLabel: true })}</span>}
        {review.model && <span>Model {review.model}</span>}
        <span>Cost {f.money(review.cost)}</span>
      </p>
      {review.summary && <p className="text-ui whitespace-pre-wrap wrap-anywhere text-foreground">{review.summary}</p>}
    </div>
  )
}

interface ReviewSectionProps {
  conversationId: string
  /** The latest review when the page rendered. */
  review: ReviewView | null
  findings: ReviewFinding[]
  hasToolEvidence: boolean
  judgeConfigured: boolean
  /** `Config.llmDisabled`: while AI features are off no review can start. */
  llmDisabled: boolean
}

/**
 * The conversation page's Review section: the Review button, the latest
 * review's status, details or coded failure, and every finding in the order
 * `getConversationReview` gives (unverified last). The details show only for
 * the review the status describes, so a new review never shows the last
 * one's summary, model or cost.
 */
export function ReviewSection({ conversationId, review, findings, hasToolEvidence, judgeConfigured, llmDisabled }: ReviewSectionProps) {
  const { showError } = useToast()
  const queryClient = useQueryClient()
  const [isStarting, startReview] = useTransition()
  const { status, failed: statusFailed, retry: retryStatus } = useReviewStatus(conversationId, review)
  const current = review && status?.reviewId === review.id && status.status === "done" ? review : null
  // A queued review can carry the code of a failed attempt BullMQ is retrying, so only a failed one shows it
  const failure = status?.status === "failed" ? { code: status.errorCode } : null
  // Why no review can start, the master AI switch first; null when one can
  const blocked = llmDisabled ? "LLM_DISABLED" : judgeConfigured ? null : "NOT_CONFIGURED"

  const onReview = () => {
    startReview(async () => {
      const result = await reviewConversation({ conversationId })
      if (!result.success) {
        showError(result.error)
        return
      }
      const started: ReviewStatus = { ...result.data, errorCode: null }
      queryClient.setQueryData(queryKeys.conversationReview(conversationId), started)
    })
  }

  return (
    <section aria-labelledby="conversation-review-heading" className="flex flex-col gap-4" data-testid="conversation-review-section">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="conversation-review-heading" className="text-h3 text-foreground">
          Review
        </h2>
        <StatusBadge domain="conversationReview" value={status?.status ?? "none"} data-testid="conversation-review-status" />
        {status && !hasToolEvidence && (
          <Badge variant="neutral" data-testid="conversation-review-no-tool-evidence">
            No tool evidence
          </Badge>
        )}
        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          onClick={onReview}
          disabled={blocked !== null}
          loading={isStarting}
          loadingLabel="Starting"
          data-testid="conversation-review-button"
        >
          {status ? "Review again" : "Review"}
        </Button>
      </div>

      <p role="status" className="sr-only" data-testid="conversation-review-announcement">
        {announcement(status, current !== null, findings.length)}
      </p>
      {statusFailed && (
        <p className="text-ui text-muted-foreground" data-testid="conversation-review-status-error">
          Could not check the review status.{" "}
          <Button variant="link" size="sm" className="h-auto px-0" onClick={retryStatus} data-testid="conversation-review-status-retry">
            Try again
          </Button>
        </p>
      )}
      {blocked && failure?.code !== blocked && (
        <p className="text-ui text-muted-foreground">
          <FailureCopy code={blocked} />
        </p>
      )}
      {failure && (
        <Alert tone="destructive">
          <FailureCopy code={failure.code} />
        </Alert>
      )}
      {current && <ReviewDetails review={current} />}
      {current && findings.length === 0 && <p className="text-ui text-muted-foreground">No findings in this conversation.</p>}

      {findings.length > 0 && (
        <ul className="flex flex-col gap-4" aria-label="Findings">
          {findings.map((finding) => (
            <li key={finding.id}>
              <FindingCard finding={finding} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
