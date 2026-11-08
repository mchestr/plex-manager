/**
 * The test email job (`EMAIL_TEST`, payload `{ userId }`), queued by
 * `sendTestEmail` (`actions/admin/email.ts`) when Redis is set up. One
 * attempt: the admin presses the button again rather than wait for a retry,
 * and each result is audited as `EMAIL_TEST_SENT` either way.
 *
 * A failed send is a result, not a thrown error, so the queue never stores a
 * reason that could hold the server's reply.
 *
 * @module lib/queue/jobs/email-test
 */

import type { Job } from "bullmq"

import { deliverTestEmail, type TestEmailResult } from "@/lib/email/send-test-email"
import { shutdownSignal } from "@/lib/instrumentation/shutdown"

import { JOB_TYPES, type JobPayloadMap } from "../types"

/** The longest the send may take. */
const SEND_LIMIT_MS = 60_000

type EmailTestJob = Pick<Job<JobPayloadMap[typeof JOB_TYPES.EMAIL_TEST]>, "data">

async function processEmailTest(job: EmailTestJob): Promise<TestEmailResult> {
  return deliverTestEmail(job.data.userId, AbortSignal.any([AbortSignal.timeout(SEND_LIMIT_MS), shutdownSignal]))
}

/** The processor for the test email job type, or null. */
export function getEmailTestProcessor(jobType: string): ((job: EmailTestJob) => Promise<TestEmailResult>) | null {
  return jobType === JOB_TYPES.EMAIL_TEST ? processEmailTest : null
}
