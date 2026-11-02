"use client"

import { useQuery, useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import { useEffect, useRef, useTransition, type MouseEvent } from "react"

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
import { REVIEW_BLOCKED_COPY, reviewErrorCopy, type ReviewErrorCopy } from "@/lib/ui/review-error-copy"

const POLL_MS = 5_000

type ReviewStatus = { reviewId: string; status: ConversationReviewStatus; errorCode: string | null }

const isPendingStatus = (value: ConversationReviewStatus | undefined) => value === "queued" || value === "running"
const isPending = (status: ReviewStatus | null | undefined) => isPendingStatus(status?.status)
const polling = (query: { state: { data?: ReviewStatus | null } }) => isPending(query.state.data)

/**
 * The latest review's status, seeded from the page. Only the 5 s poll calls
 * the action, and only while the review is queued or running: the action
 * refreshes the page once it reads done or failed, so the poll stops there.
 * `enabled` is a function of the query, so `setQueryData` after Review starts
 * the poll without an immediate call. A failed call is not retried and stops
 * the poll until the admin retries it. A refreshed page whose review is not
 * the cached one (another admin or the nightly sweep started it) reseeds it,
 * and so does one whose review finished while the cache still has it queued
 * or running, as after a failed call or on a return to the page.
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
    const cached = queryClient.getQueryData<ReviewStatus | null>(key)
    // A finished review never goes back to pending, so the page's done or failed status is newer than a cached
    // queued or running one for the same review, and a cached finished status is newer than a pending page
    const newer = cached?.reviewId !== reviewId || (isPending(cached) && !isPendingStatus(reviewStatus))
    if (!newer) return
    const seed: ReviewStatus = { reviewId, status: reviewStatus, errorCode: reviewErrorCode }
    queryClient.setQueryData<ReviewStatus | null>(key, seed)
  }, [queryClient, conversationId, reviewId, reviewStatus, reviewErrorCode])

  return {
    status: query.data,
    failed: query.isError,
    checking: query.isFetching,
    /** Checks again, and says whether the status came back. */
    retry: async () => (await query.refetch()).isSuccess,
  }
}

/** Fixed copy, then its settings link when it has one, under the test id of the place that shows it. */
function CopyWithLink({ copy, linkTestId }: { copy: ReviewErrorCopy; linkTestId: string }) {
  return (
    <>
      {copy.message}
      {copy.link && (
        <>
          {" "}
          <Link href={copy.link.href} className="underline underline-offset-3" data-testid={linkTestId}>
            {copy.link.label}
          </Link>
        </>
      )}
    </>
  )
}

interface AnnouncementState {
  status: ReviewStatus | null | undefined
  /** The last status check failed, so the status shown may be out of date. */
  checkFailed: boolean
  /** The page shows the finished review's details. */
  finished: boolean
  /** The failure's Alert shows; the blocked notice hides one with its own code. */
  failureShown: boolean
  openFindings: number
}

/**
 * What the status region says: that the status check failed, the review's progress, and its result once the page
 * shows it. A failure the Alert shows is the Alert's to say; one the blocked notice hides is said here, since the
 * notice is not a live region. The result counts open findings only: a review never deletes findings, so the page
 * also shows those triaged before it.
 */
function announcement({ status, checkFailed, finished, failureShown, openFindings }: AnnouncementState): string {
  if (checkFailed) return "Could not check the review status"
  if (status?.status === "queued") return "Review queued"
  if (status?.status === "running") return "Reviewing the conversation"
  if (status?.status === "failed") return failureShown ? "" : "Review failed"
  if (!finished) return ""
  return `Review finished, ${openFindings === 0 ? "no open findings" : openFindings === 1 ? "1 open finding" : `${openFindings} open findings`}`
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
 * one's summary, model or cost. While no review can start, a notice says why
 * in the present tense, and a failure with that same code is left to it.
 * While a review is queued or running, Review keeps focus but sends nothing,
 * until a status check fails.
 */
export function ReviewSection({ conversationId, review, findings, hasToolEvidence, judgeConfigured, llmDisabled }: ReviewSectionProps) {
  const { showError } = useToast()
  const queryClient = useQueryClient()
  const [isStarting, startReview] = useTransition()
  const heading = useRef<HTMLHeadingElement>(null)
  const { status, failed: statusFailed, checking, retry: retryStatus } = useReviewStatus(conversationId, review)
  const current = review && status?.reviewId === review.id && status.status === "done" ? review : null
  // Why no review can start, the master AI switch first; null when one can
  const blocked = llmDisabled ? "LLM_DISABLED" : judgeConfigured ? null : "NOT_CONFIGURED"
  // A queued review can carry the code of a failed attempt BullMQ is retrying, so only a failed one shows it,
  // and not while the same code still blocks the section: the notice says so in the present tense
  const failure = status?.status === "failed" && (blocked === null || status.errorCode !== blocked) ? { code: status.errorCode } : null
  // Review waits on a queued or running review: a press would only get it back, yet spend a rate-limit point and
  // write an audit row. Once a status check fails it is the way to recover, as it reaps a dead review
  const waiting = isPending(status) && !statusFailed

  // Next's client navigation scrolls a #finding-<id> link's card into view but, unlike a native fragment link, leaves
  // focus where it was. Focus moves to the card, so the next Tab reaches its triage controls
  useEffect(() => {
    const id = window.location.hash.slice(1)
    if (id.startsWith("finding-")) document.getElementById(id)?.focus()
  }, [])

  const onRetry = (event: MouseEvent<HTMLButtonElement>) => {
    const button = event.currentTarget
    void retryStatus().then((checked) => {
      // Try again goes with the error line once the check succeeds: focus moves to the heading, not the body
      if (checked && (document.activeElement === button || document.activeElement === document.body)) heading.current?.focus()
    })
  }

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
        <h2 ref={heading} id="conversation-review-heading" tabIndex={-1} className="text-h3 text-foreground outline-none">
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
          disabled={blocked !== null || waiting}
          focusableWhenDisabled={waiting}
          loading={isStarting}
          loadingLabel="Starting"
          data-testid="conversation-review-button"
        >
          {status ? "Review again" : "Review"}
        </Button>
      </div>

      <p role="status" className="sr-only" data-testid="conversation-review-announcement">
        {announcement({
          status,
          checkFailed: statusFailed,
          finished: current !== null,
          failureShown: failure !== null,
          openFindings: findings.filter((finding) => finding.status === "open").length,
        })}
      </p>
      {statusFailed && (
        <p className="text-ui text-muted-foreground" data-testid="conversation-review-status-error">
          Could not check the review status.{" "}
          <Button
            variant="link"
            size="sm"
            className="h-auto px-0"
            onClick={onRetry}
            loading={checking}
            loadingLabel="Checking"
            data-testid="conversation-review-status-retry"
          >
            Try again
          </Button>
        </p>
      )}
      {blocked && (
        <p className="text-ui text-muted-foreground" data-testid="conversation-review-blocked">
          <CopyWithLink copy={REVIEW_BLOCKED_COPY[blocked]} linkTestId="conversation-review-blocked-link" />
        </p>
      )}
      {failure && (
        <Alert tone="destructive">
          <CopyWithLink copy={reviewErrorCopy(failure.code)} linkTestId="conversation-review-failure-link" />
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
