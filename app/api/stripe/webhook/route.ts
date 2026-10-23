import { NextRequest, NextResponse } from "next/server"

import { getStripe } from "@/lib/stripe/client"
import { prisma } from "@/lib/prisma"
import { sanitizeJobId } from "@/lib/queue/job-id"
import { enqueueFromRequest, withRequestPathQueue } from "@/lib/queue/request-path"
import { JOB_TYPES } from "@/lib/queue/types"
import { createLogger } from "@/lib/utils/logger"
import { withRequestContext } from "@/lib/actions/route"

/**
 * Stripe delivers webhooks as POST requests that must be verified against the
 * raw request body, so this route must never be statically cached.
 */
export const dynamic = "force-dynamic"

const logger = createLogger("STRIPE_WEBHOOK")

/** Stripe event payloads are far smaller than this; a body near 1 MiB is not from Stripe. */
const MAX_BODY_BYTES = 1024 * 1024

/**
 * Reads the raw body as text, or returns `null` once it is larger than
 * {@link MAX_BODY_BYTES}. A declared `Content-Length` over the cap is refused
 * before anything is read, and a body without one is read in chunks and
 * abandoned at the cap, so an unsigned request cannot make the route buffer an
 * arbitrary amount before the signature check.
 */
async function readCappedBody(request: Request): Promise<string | null> {
  if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) {
    return null
  }
  if (!request.body) {
    return ""
  }

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
    size += chunk.value.byteLength
    if (size > MAX_BODY_BYTES) {
      await reader.cancel()
      return null
    }
    chunks.push(chunk.value)
  }
  return new TextDecoder().decode(Buffer.concat(chunks))
}

/** 503 while the queue is down: Stripe retries the delivery, and nothing was recorded. */
function queueUnavailable(eventId: string): NextResponse {
  logger.warn("Stripe webhook not enqueued: the job queue is unavailable", { eventId })
  return NextResponse.json({ error: "Queue unavailable" }, { status: 503 })
}

/**
 * POST /api/stripe/webhook
 *
 * Verifies the Stripe signature against the raw body, deduplicates events on
 * `StripeEvent(event.id)`, enqueues a `STRIPE_WEBHOOK` job for asynchronous
 * processing, and returns 200 quickly. All side effects happen in the job.
 *
 * - 400 on signature verification failure (never 5xx for a bad signature —
 *   Stripe would retry).
 * - 503 while the job queue is unavailable (Redis down), within about two
 *   seconds, so Stripe retries the delivery later (P11.3).
 * - 413 when the body is over 1 MiB, before the signature is checked.
 * - 200 without re-enqueue when the event was already processed (idempotency).
 * - 200 + `job.retry()` when an unprocessed event's job failed (SEC-40), so the
 *   dashboard's "Resend event" recovers it; 200 alone while its job is waiting,
 *   delayed or running.
 * - 200 + enqueue for a new event, or one whose job BullMQ has dropped.
 *
 * There is no IP rate limit: the signature is the gate, and an IP limit in
 * front of it would let anyone who spoofs Stripe's addresses get genuine
 * deliveries rejected with 429.
 */
async function handlePost(request: NextRequest): Promise<NextResponse> {
  const stripe = await getStripe()
  if (!stripe) {
    logger.warn("Received Stripe webhook but Stripe is not configured")
    return NextResponse.json(
      { error: "Stripe is not configured" },
      { status: 503 }
    )
  }

  const config = await prisma.config.findUnique({
    where: { id: "config" },
    select: { stripeWebhookSecret: true },
  })
  const webhookSecret = config?.stripeWebhookSecret
  if (!webhookSecret) {
    logger.warn("Received Stripe webhook but no webhook secret is configured")
    return NextResponse.json(
      { error: "Stripe webhook secret is not configured" },
      { status: 503 }
    )
  }

  // Raw body is required for HMAC signature verification — never parse JSON first.
  const rawBody = await readCappedBody(request)
  if (rawBody === null) {
    logger.warn("Stripe webhook body over the size cap", { maxBytes: MAX_BODY_BYTES })
    return NextResponse.json({ error: "Payload too large" }, { status: 413 })
  }
  const signature = request.headers.get("stripe-signature")

  let event
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature ?? "", webhookSecret)
  } catch (error) {
    logger.warn("Stripe webhook signature verification failed", {
      error: String(error),
    })
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
  }

  // Idempotency: an event is a duplicate only once its handler has succeeded.
  const existing = await prisma.stripeEvent.findUnique({
    where: { id: event.id },
    select: { processedAt: true },
  })
  if (existing?.processedAt) {
    logger.info("Duplicate Stripe event ignored", {
      eventId: event.id,
      eventType: event.type,
    })
    return NextResponse.json({ received: true, duplicate: true })
  }

  // An unprocessed resend recovers its job: a failed job runs again, a queued
  // or running one is left alone.
  const recovered = await withRequestPathQueue("stripe-webhook", async (queue) => {
    const job = await queue.getJob(sanitizeJobId(event.id))
    if (!job) return "absent" as const
    const state = await job.getState()
    if (state === "failed") {
      await job.retry()
      return "retried" as const
    }
    if (state !== "completed" && state !== "unknown") return "queued" as const
    // A completed job whose event is unprocessed cannot be re-added under its id until it is gone.
    await job.remove()
    return "absent" as const
  })
  if (!recovered.ok) return queueUnavailable(event.id)
  if (recovered.value === "retried") {
    logger.info("Stripe event resent; retrying its failed job", { eventId: event.id, eventType: event.type })
    return NextResponse.json({ received: true, retried: true })
  }
  if (recovered.value === "queued") {
    return NextResponse.json({ received: true, queued: true })
  }

  const queued = await enqueueFromRequest(JOB_TYPES.STRIPE_WEBHOOK, { eventId: event.id }, { jobId: event.id })
  if (!queued.ok) return queueUnavailable(event.id)

  logger.info("Stripe webhook enqueued", {
    eventId: event.id,
    eventType: event.type,
  })

  return NextResponse.json({ received: true })
}

export const POST = withRequestContext(handlePost)
