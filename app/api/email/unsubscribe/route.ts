import { NextResponse } from "next/server"
import { z } from "zod"

import { parseSearchParams, withRequestContext } from "@/lib/actions/route"
import { saveAccessReminders } from "@/lib/email/access-reminders"
import { serverName } from "@/lib/brand"
import { getBaseUrl } from "@/lib/env"
import { limitRequest } from "@/lib/security/rate-limit"
import { MAX_UNSUBSCRIBE_TOKEN_LENGTH, verifyUnsubscribeToken } from "@/lib/security/unsubscribe-token"
import { createLogger } from "@/lib/utils/logger"

/**
 * The one-click unsubscribe address of an email's `List-Unsubscribe` header
 * (RFC 8058). A mail provider posts `List-Unsubscribe=One-Click` here from
 * its own servers, with no cookie and no `Origin`, when the member presses
 * its unsubscribe button. The unsubscribe page's button posts the same form
 * here, with `&source=page`, when the browser runs no JavaScript. The token
 * in `?token=` is the only proof, and it can only turn the access reminders
 * off (`lib/email/access-reminders.ts`).
 *
 * - `POST`: rate-limited per address (`email:unsubscribe`). It reads at most
 *   1 KB of a form-encoded or multipart body, which must hold
 *   `List-Unsubscribe=One-Click`, then turns the emails off. 200 with a
 *   short text, also when they were off already; 400 with no detail for a
 *   bad token or body; 415 for another body type. With `source=page` the
 *   change is audited as the link (`via: "link"`), not the mail app's
 *   button, and a dead token answers with the page's dead-link text. The
 *   field proves nothing: it only names the button that the member pressed.
 * - `GET`: a 303 to the unsubscribe page, which asks first. It changes
 *   nothing, so a link scanner or a preview bot cannot unsubscribe anyone.
 *
 * Every answer is `Cache-Control: no-store`; `next.config.js` adds
 * `Referrer-Policy: no-referrer` and `X-Robots-Tag` too. No log line holds
 * the token: the logger masks `token=` in a URL.
 */

const logger = createLogger("EMAIL")

/** The largest body read: the field is 26 bytes, and a multipart frame adds a few hundred. */
const MAX_BODY_BYTES = 1024

const NO_STORE = { "Cache-Control": "no-store" }

const tokenQuery = z.object({ token: z.string().min(1).max(MAX_UNSUBSCRIBE_TOKEN_LENGTH) })

/** The shape `signValue` writes: base64url, a dot, base64url. Anything else never reaches the redirect. */
const TOKEN_SHAPE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/

const text = (body: string, status: number) =>
  new NextResponse(body, { status, headers: { ...NO_STORE, "Content-Type": "text/plain; charset=utf-8" } })

type Via = "link" | "one_click"

const refuse = (via: Via, reason: string, body = "Bad request") => {
  logger.warn("email.unsubscribe_refused", { via, reason })
  return text(body, 400)
}

/** The page's form posts `source=page`; a mail provider's POST never does. */
const viaOf = (url: string): Via => (new URL(url).searchParams.get("source") === "page" ? "link" : "one_click")

/** A dead token from the page's form gets the page's own words; a mail provider gets no detail. */
async function refuseToken(via: Via, reason: string) {
  if (via === "one_click") return refuse(via, reason)
  return refuse(via, reason, `This link no longer works. Sign in to ${await serverName()} and open Account to choose your emails.`)
}

/** The body, or null once it passes `limit` bytes (by its `Content-Length` or as it is read). */
async function readCapped(request: Request, limit: number): Promise<Uint8Array | null> {
  if (Number(request.headers.get("content-length")) > limit) return null
  if (!request.body) return new Uint8Array()
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > limit) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  return Buffer.concat(chunks)
}

/** Whether the form body holds `List-Unsubscribe=One-Click`; null when it does not parse. */
async function isOneClick(body: Uint8Array, contentType: string): Promise<boolean | null> {
  try {
    const form = await new Response(Buffer.from(body), { headers: { "Content-Type": contentType } }).formData()
    return form.get("List-Unsubscribe") === "One-Click"
  } catch {
    return null
  }
}

async function handlePost(request: Request) {
  const limited = await limitRequest("email:unsubscribe", request)
  if (limited) {
    limited.headers.set("Cache-Control", "no-store")
    return limited
  }

  const via = viaOf(request.url)
  const contentType = request.headers.get("content-type") ?? ""
  if (!/^(application\/x-www-form-urlencoded|multipart\/form-data)\b/i.test(contentType)) {
    logger.warn("email.unsubscribe_refused", { via, reason: "content_type" })
    return text("Unsupported media type", 415)
  }

  const query = parseSearchParams(tokenQuery, request.url)
  if (!query.ok) return refuseToken(via, "no_token")

  const body = await readCapped(request, MAX_BODY_BYTES)
  if (body === null) return refuse(via, "body_too_large")
  if (!(await isOneClick(body, contentType))) return refuse(via, "not_one_click")

  const userId = verifyUnsubscribeToken(query.data.token)
  if (!userId) return refuseToken(via, "bad_token")

  const saved = await saveAccessReminders(userId, { enabled: false, via })
  if (saved === "no_member") return refuseToken(via, "no_member")

  logger.info("email.unsubscribed", { userId, via, changed: saved === "changed" })
  return text(`Done. We will not send you these emails. To turn them on again, sign in to ${await serverName()} and open Account.`, 200)
}

/** Sends a GET (a click, a scanner, a preview) to the page, which changes nothing until the member asks. */
async function handleGet(request: Request) {
  const token = new URL(request.url).searchParams.get("token")
  const page = new URL("/email/unsubscribe", getBaseUrl())
  if (token && token.length <= MAX_UNSUBSCRIBE_TOKEN_LENGTH && TOKEN_SHAPE.test(token)) page.searchParams.set("token", token)
  return NextResponse.redirect(page, { status: 303, headers: NO_STORE })
}

export const POST = withRequestContext(handlePost)
export const GET = withRequestContext(handleGet)
