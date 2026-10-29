/**
 * The invite page's headline for an affiliate invite. The make-invite dialog
 * shows the same text, so the affiliate sees exactly what their invitee reads.
 * Without a name (blank, or shaped like an email) it is the plain invite
 * headline.
 */
export function affiliateInviteHeadline(inviter: string | null, serverName: string): string {
  return inviter ? `${inviter} invited you to ${serverName}` : `You're invited to ${serverName}`
}

/** The name an invite shows for its inviter: null for a blank name or an email-shaped one. */
export function inviterDisplayName(name: string | null | undefined): string | null {
  const trimmed = name?.trim()
  return trimmed && !trimmed.includes("@") ? trimmed : null
}
