/**
 * Factory for creating test invite data
 */

export type ServerType = 'PLEX' | 'JELLYFIN'

export interface InviteData {
  id: string
  code: string
  serverType: ServerType
  maxUses: number
  useCount: number
  expiresAt: Date | null
  createdAt: Date
  createdBy: string | null
  librarySectionIds: string | null
  allowDownloads: boolean
  jellyfinLibraryIds: string | null
}

let inviteCounter = 0

export const resetInviteFactory = () => {
  inviteCounter = 0
}

/**
 * Generate a random invite code
 */
function generateInviteCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let code = ''
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return code
}

/**
 * Create an invite with optional overrides
 */
export function createInvite(overrides: Partial<InviteData> = {}): InviteData {
  inviteCounter++
  const id = `invite-${Date.now()}-${inviteCounter}`
  return {
    id,
    code: generateInviteCode(),
    serverType: 'PLEX',
    maxUses: 1,
    useCount: 0,
    expiresAt: null,
    createdAt: new Date(),
    createdBy: 'admin-user-id',
    librarySectionIds: null,
    allowDownloads: false,
    jellyfinLibraryIds: null,
    ...overrides,
  }
}

/**
 * Create a Jellyfin invite
 */
export function createJellyfinInvite(overrides: Partial<InviteData> = {}): InviteData {
  return createInvite({
    serverType: 'JELLYFIN',
    ...overrides,
  })
}

/**
 * Create an expired invite
 */
export function createExpiredInvite(overrides: Partial<InviteData> = {}): InviteData {
  return createInvite({
    expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
    ...overrides,
  })
}

/**
 * Create a fully used invite
 */
export function createUsedInvite(overrides: Partial<InviteData> = {}): InviteData {
  return createInvite({
    maxUses: 1,
    useCount: 1,
    ...overrides,
  })
}

/**
 * Create a multi-use invite
 */
export function createMultiUseInvite(
  maxUses: number,
  overrides: Partial<InviteData> = {}
): InviteData {
  return createInvite({
    maxUses,
    useCount: 0,
    ...overrides,
  })
}
