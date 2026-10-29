import Link from "next/link"

import { Badge } from "@/components/ui/badge"
import type { AffiliateFlag } from "@/lib/affiliates/flags"
import { userDetail } from "@/lib/admin/routes"

const FLAG_LABELS: Record<AffiliateFlag, string> = {
  new_member: "Joined in the last 60 days",
  invited: "Joined by an affiliate invite",
  recent_hours: "Most hours in the last 30 days",
  shared_email: "Plex email on another account",
  tier_raised: "Tier went up",
}

/**
 * The member's name, linked to their page for admins (Support cannot open a
 * member's page), and "No longer a member" once their access ended.
 */
export function MemberCell({ member, linked }: { member: { id: string; name: string; accessEndedAt: Date | null }; linked: boolean }) {
  return (
    <span className="flex flex-wrap items-center gap-2">
      {linked ? (
        <Link href={userDetail(member.id)} className="font-medium hover:underline" data-testid={`admin-affiliates-member-${member.id}`}>
          {member.name}
        </Link>
      ) : (
        <span className="font-medium">{member.name}</span>
      )}
      {member.accessEndedAt && <Badge variant="warning">No longer a member</Badge>}
    </span>
  )
}

export function FlagBadges({ flags, testId }: { flags: readonly AffiliateFlag[]; testId: string }) {
  if (flags.length === 0) return <span className="text-muted-foreground">None</span>
  return (
    <span className="flex flex-wrap gap-1" data-testid={testId}>
      {flags.map((flag) => (
        <Badge key={flag} variant="info" data-testid={`${testId}-${flag}`}>
          {FLAG_LABELS[flag]}
        </Badge>
      ))}
    </span>
  )
}
