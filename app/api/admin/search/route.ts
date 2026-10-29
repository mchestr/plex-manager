import { NextRequest, NextResponse } from "next/server"

import { parseSearchParams, withRequestContext } from "@/lib/actions/route"
import { invite as inviteRoute, userDetail } from "@/lib/admin/routes"
import { adminSearchQuerySchema, type AdminSearchKind, type AdminSearchResponse, type AdminSearchResult } from "@/lib/admin/search"
import { prisma } from "@/lib/prisma"
import { requireAdminAPI } from "@/lib/security/api-helpers"
import { createSafeError, ErrorCode, getStatusCode, logError } from "@/lib/security/error-handler"
import { limitRequest } from "@/lib/security/rate-limit"

const TAKE = 8

async function searchUsers(q: string): Promise<AdminSearchResult[]> {
  const users = await prisma.user.findMany({
    where: {
      OR: [{ name: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }],
    },
    select: { id: true, name: true, email: true, isAdmin: true },
    orderBy: { name: "asc" },
    take: TAKE,
  })
  return users.map((user) => ({
    id: user.id,
    label: user.name ?? user.email ?? "Unnamed member",
    sub: [user.name ? user.email : null, user.isAdmin ? "Admin" : "Member"].filter(Boolean).join(", "),
    href: userDetail(user.id),
  }))
}

async function searchInvites(q: string): Promise<AdminSearchResult[]> {
  const invites = await prisma.invite.findMany({
    // New codes are stored uppercase (SEC-56); older ones may not be
    // Admin invites only: a member's affiliate invite is not shown in Admin → Invites
    where: { kind: "ADMIN", code: { startsWith: q, mode: "insensitive" } },
    select: { id: true, code: true, serverType: true, useCount: true, maxUses: true, expiresAt: true },
    orderBy: { code: "asc" },
    take: TAKE,
  })
  const now = Date.now()
  return invites.map((invite) => {
    const server = invite.serverType === "JELLYFIN" ? "Jellyfin" : "Plex"
    const state = invite.expiresAt && invite.expiresAt.getTime() <= now ? "expired" : `${invite.useCount} of ${invite.maxUses} used`
    return { id: invite.id, label: invite.code, sub: `${server}, ${state}`, href: inviteRoute(invite.id) }
  })
}

const SEARCHES: Record<AdminSearchKind, (q: string) => Promise<AdminSearchResult[]>> = {
  users: searchUsers,
  invites: searchInvites,
}

/**
 * The command menu's search (P10.16, UI-41): users by name or email, invites
 * by code prefix. A GET route rather than a server action, because actions
 * run one at a time per client and search-as-you-type would queue. Each kind
 * selects only public fields, so no token or secret can reach the response.
 */
async function handleGet(request: NextRequest) {
  try {
    const limited = await limitRequest("admin:search", request)
    if (limited) return limited

    const auth = await requireAdminAPI(request)
    if (auth.response) return auth.response

    const query = parseSearchParams(adminSearchQuerySchema, request.nextUrl)
    if (!query.ok) return query.response

    const results = await SEARCHES[query.data.kind](query.data.q)
    return NextResponse.json({ results } satisfies AdminSearchResponse)
  } catch (error) {
    logError("ADMIN_SEARCH_API", error)
    return NextResponse.json(createSafeError(ErrorCode.INTERNAL_ERROR, "Search failed"), {
      status: getStatusCode(ErrorCode.INTERNAL_ERROR),
    })
  }
}

export const GET = withRequestContext(handleGet)
