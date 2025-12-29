/**
 * MSW handlers for invite-related endpoints
 */

import { http, HttpResponse } from 'msw'
import { createInvite, type InviteData } from '../../fixtures/factories'

// In-memory store for invites
const inviteStore = new Map<string, InviteData>()

/**
 * Set an invite in the store
 */
export const setInvite = (invite: InviteData) => {
  inviteStore.set(invite.code, invite)
  return invite
}

/**
 * Clear the invite store
 */
export const clearInviteStore = () => {
  inviteStore.clear()
}

/**
 * Get an invite by code
 */
export const getInviteByCode = (code: string) => {
  return inviteStore.get(code)
}

/**
 * Create and store an invite
 */
export const createAndStoreInvite = (overrides: Partial<InviteData> = {}) => {
  const invite = createInvite(overrides)
  inviteStore.set(invite.code, invite)
  return invite
}

/**
 * Check if an invite is valid
 */
function isInviteValid(invite: InviteData): { valid: boolean; reason?: string } {
  // Check if used up
  if (invite.useCount >= invite.maxUses) {
    return { valid: false, reason: 'Invite has been fully used' }
  }

  // Check if expired
  if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) {
    return { valid: false, reason: 'Invite has expired' }
  }

  return { valid: true }
}

/**
 * Invite API handlers
 * Note: Most invite validation happens via server actions, not API routes.
 * These handlers are for any API-based invite operations.
 */
export const inviteHandlers = [
  // GET /api/invites/validate/[code] - Validate an invite code
  // Note: The actual app may use server actions instead
  http.get('**/api/invites/validate/:code', ({ params }) => {
    const { code } = params as { code: string }
    const invite = inviteStore.get(code.toUpperCase())

    if (!invite) {
      return HttpResponse.json(
        {
          valid: false,
          error: 'Invite not found',
        },
        { status: 404 }
      )
    }

    const validation = isInviteValid(invite)

    if (!validation.valid) {
      return HttpResponse.json({
        valid: false,
        error: validation.reason,
        invite: {
          serverType: invite.serverType,
          maxUses: invite.maxUses,
          useCount: invite.useCount,
          expiresAt: invite.expiresAt?.toISOString() ?? null,
        },
      })
    }

    return HttpResponse.json({
      valid: true,
      invite: {
        serverType: invite.serverType,
        maxUses: invite.maxUses,
        useCount: invite.useCount,
        expiresAt: invite.expiresAt?.toISOString() ?? null,
      },
    })
  }),
]

/**
 * Create a handler that returns an invalid invite response
 */
export const createInvalidInviteHandler = (reason: string = 'Invite not found') =>
  http.get('**/api/invites/validate/:code', () => {
    return HttpResponse.json(
      {
        valid: false,
        error: reason,
      },
      { status: 404 }
    )
  })

/**
 * Create a handler that returns a valid invite response
 */
export const createValidInviteHandler = (
  serverType: 'PLEX' | 'JELLYFIN' = 'PLEX',
  maxUses: number = 1
) =>
  http.get('**/api/invites/validate/:code', () => {
    return HttpResponse.json({
      valid: true,
      invite: {
        serverType,
        maxUses,
        useCount: 0,
        expiresAt: null,
      },
    })
  })
