import { NextRequest, NextResponse } from "next/server"

import { withRequestContext } from "@/lib/actions/route"
import { getBaseUrl } from "@/lib/env"
import { handleMessage, INVALID_REQUEST, PARSE_ERROR, rpcError } from "@/lib/mcp/server"
import { authenticateToken, bearerToken } from "@/lib/mcp/tokens"
import { consume, limitRequest } from "@/lib/security/rate-limit"
import { RATE_LIMITED_MESSAGE } from "@/lib/security/rate-limit-messages"
import { generateRequestId, getLogContext } from "@/lib/utils/log-context"

/**
 * The MCP endpoint (docs/mcp.md): Streamable HTTP, one JSON-RPC message per
 * POST, answered with JSON (`lib/mcp/server.ts`).
 *
 * - `Authorization: Bearer pmk_...`, a personal API token of an enabled admin
 *   (`lib/mcp/tokens.ts`); anything else is a 401.
 * - A browser's `Origin` must be this app's, so a page elsewhere cannot drive
 *   it (the transport's DNS rebinding rule); MCP clients send none.
 * - 600 requests a minute per address (`mcp:ip`) before the token is looked
 *   up, then 120 a minute per token (`mcp`), on top of each action's own limit.
 * - A body over 1 MB is a 413: by its Content-Length before it is read, else
 *   when reading passes 1 MB, so a chunked upload never buffers more.
 * - GET (a server stream) and DELETE (a session) are 405: the server is stateless.
 */

const NO_STORE = { "Cache-Control": "no-store" }
const MAX_BODY_BYTES = 1_000_000

/** The body as text, or null once it passes {@link MAX_BODY_BYTES}; reading stops there. */
async function readBody(request: Request): Promise<string | null> {
  if (!request.body) return ""
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > MAX_BODY_BYTES) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }
  return new TextDecoder().decode(Buffer.concat(chunks))
}

function tooLarge() {
  return NextResponse.json(rpcError(null, INVALID_REQUEST, "Request too large"), { status: 413, headers: NO_STORE })
}

function unauthorized() {
  return NextResponse.json(
    { error: "A valid API token is required" },
    { status: 401, headers: { ...NO_STORE, "WWW-Authenticate": 'Bearer realm="plex-manager-mcp"' } }
  )
}

function originAllowed(origin: string | null): boolean {
  if (!origin) return true
  try {
    return new URL(origin).origin === new URL(getBaseUrl()).origin
  } catch {
    return false
  }
}

async function handlePost(request: NextRequest) {
  if (!originAllowed(request.headers.get("origin"))) {
    return NextResponse.json({ error: "Origin not allowed" }, { status: 403, headers: NO_STORE })
  }
  // Before the token lookup, so requests with bad tokens cannot cost a query each without limit
  const addressLimited = await limitRequest("mcp:ip", request)
  if (addressLimited) return addressLimited
  const token = bearerToken(request.headers.get("authorization"))
  const principal = token ? await authenticateToken(token) : null
  if (!principal) return unauthorized()

  const limit = await consume("mcp", principal.tokenId)
  if (!limit.ok) {
    return NextResponse.json(
      { error: RATE_LIMITED_MESSAGE },
      { status: 429, headers: { ...NO_STORE, "Retry-After": String(limit.retryAfterSec) } }
    )
  }

  if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) return tooLarge()
  const text = await readBody(request)
  if (text === null) return tooLarge()
  let body: unknown
  try {
    body = JSON.parse(text)
  } catch {
    return NextResponse.json(rpcError(null, PARSE_ERROR, "Parse error"), { status: 400, headers: NO_STORE })
  }

  const requestId = getLogContext()?.requestId ?? generateRequestId()
  const response = await handleMessage(body, principal, requestId)
  if (!response) return new NextResponse(null, { status: 202, headers: NO_STORE })
  return NextResponse.json(response, { headers: NO_STORE })
}

function methodNotAllowed() {
  return new NextResponse(null, { status: 405, headers: { ...NO_STORE, Allow: "POST" } })
}

export const POST = withRequestContext(handlePost)
export const GET = withRequestContext(async (_request: NextRequest) => methodNotAllowed())
export const DELETE = withRequestContext(async (_request: NextRequest) => methodNotAllowed())
