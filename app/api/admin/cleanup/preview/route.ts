import { NextRequest, NextResponse } from "next/server"

import { parseJsonBody, withRequestContext } from "@/lib/actions/route"
import { namesRequesters } from "@/lib/cleanup/preview/rows"
import { runPreview } from "@/lib/cleanup/preview/run-preview"
import { requireAdminAPI } from "@/lib/security/api-helpers"
import { auditMemberListed } from "@/lib/security/audit-log"
import { createSafeError, ErrorCode, getStatusCode, logError } from "@/lib/security/error-handler"
import { limitRequest } from "@/lib/security/rate-limit"
import { previewRequestSchema } from "@/lib/validations/cleanup-actions"

const NO_STORE = { "Cache-Control": "no-store" }

/** The status of an answer to a client that went away (nginx's "client closed request"). Nobody reads it. */
const CLIENT_CLOSED = 499

/**
 * The rule editor's live preview (TS 10.6, E9): `POST` with the draft, the
 * tab, the sort, the page, the search, the near-miss chip and the focus.
 * A route rather than a Server Action, because actions run one at a time
 * per client and cannot be aborted: each edit aborts the request before it.
 * The rows name requesters, so the read is audited (`cleanup-requesters`),
 * and the answer is never cached.
 */
async function handlePost(request: NextRequest) {
  try {
    const limited = await limitRequest("admin:cleanup-preview", request)
    if (limited) return limited

    const auth = await requireAdminAPI(request)
    if (auth.response) return auth.response

    const body = await parseJsonBody(previewRequestSchema, request, NO_STORE)
    if (!body.ok) return body.response

    const actorId = auth.session.user.id
    const preview = await runPreview(body.data, { actorId, signal: request.signal })
    if (preview.rows.some((row) => namesRequesters(row.requestedBy))) {
      await auditMemberListed("cleanup-requesters", actorId, body.data.ruleId ? { ruleId: body.data.ruleId } : {})
    }
    return NextResponse.json(preview, { headers: NO_STORE })
  } catch (error) {
    if (request.signal.aborted) return new NextResponse(null, { status: CLIENT_CLOSED, headers: NO_STORE })
    logError("CLEANUP_PREVIEW_API", error)
    return NextResponse.json(createSafeError(ErrorCode.INTERNAL_ERROR, "Preview failed"), {
      status: getStatusCode(ErrorCode.INTERNAL_ERROR),
      headers: NO_STORE,
    })
  }
}

export const POST = withRequestContext(handlePost)
