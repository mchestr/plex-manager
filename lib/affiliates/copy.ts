/**
 * The invite page's headline for an affiliate invite. The make-invite dialog
 * shows the same text, so the affiliate sees exactly what their invitee reads.
 * Without a name (blank, or shaped like an email) it is the plain invite
 * headline.
 */
export function affiliateInviteHeadline(inviter: string | null, serverName: string): string {
  return inviter ? `${inviter} invited you to ${serverName}` : `You're invited to ${serverName}`
}
