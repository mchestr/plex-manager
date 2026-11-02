/**
 * A conversation review's BullMQ job id, in a module of its own:
 * `lib/queue/types.ts` names it in the job's id policy, and the admin queues
 * table loads that module in the browser, which must never pull in the queue
 * client. `lib/judge/job-state.ts` re-exports it beside the state read.
 *
 * @module lib/judge/job-id
 */

/** The review's job id. BullMQ rejects a custom id with a `:`, so this has none. */
export function reviewJobId(reviewId: string): string {
  return `judge-review-${reviewId}`
}
