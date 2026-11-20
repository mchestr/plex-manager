import type { LucideIcon } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Icon } from "@/components/ui/icon"
import { joinAnd, NOUNS } from "@/lib/cleanup/fields/words"
import type { CleanupTurnOnData } from "@/lib/cleanup/types/screens"
import { icons } from "@/lib/ui/icons"

interface Line {
  id: string
  icon: LucideIcon
  /** The bold lead: "Plex:", "The app:", "Keep:". */
  lead: string | null
  text: string
}

/** "the Home of the 27 members who can see Movies" (UX 8.7). Null when plex.tv did not answer: no count. */
function homes(data: CleanupTurnOnData): string {
  const libraries = joinAnd(data.visibility.libraries)
  const n = data.visibility.membersWhoCanSee
  if (n === null) return `the Home of the members who can see ${libraries}`
  return `the Home of the ${n === 1 ? "1 member who can" : `${n} members who can`} see ${libraries}`
}

/** The four lines of "Who sees it" (UX 4.6, 8.7). Counts only: no member is named (TS 12.7 item 7). @internal Exported for tests. */
export function whoSeesLines(data: CleanupTurnOnData): Line[] {
  const [item] = NOUNS[data.rule.level]
  const linked = data.linkedMembers
  const app =
    linked === 0
      ? `the Leaving soon page and a Home row. No member requested or played a ${item} in this batch.`
      : `the Leaving soon page and a Home row. ${linked === 1 ? "1 member" : `${linked} members`} requested or played a ${item} in this batch. ` +
        "They see it under For you."
  const { keeps } = data
  const keep = keeps.enabled
    ? `a member can keep a ${item} for ${keeps.days} days, and up to ${keeps.limit} at a time. A kept ${item} leaves Leaving soon at once.`
    : "members cannot keep titles. You can turn Keeps on in Settings, under Member options."
  return [
    { id: "plex", icon: icons.plex, lead: "Plex:", text: `the collection ${data.visibility.collection}, sorted by leave date, on your Home and on ${homes(data)}.` },
    { id: "app", icon: icons.users, lead: "The app:", text: app },
    { id: "keep", icon: icons.keep, lead: "Keep:", text: keep },
    { id: "message", icon: icons.info, lead: null, text: "No message is sent to members." },
  ]
}

/** "Who sees it" (UX 4.6, 8.7): Plex, the app, Keeps, and no message. */
export function WhoSeesCard({ data }: { data: CleanupTurnOnData }) {
  return (
    <Card data-testid="admin-cleanup-turn-on-who-sees">
      <CardHeader>
        <CardTitle as="h2">Who sees it</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-3">
          {whoSeesLines(data).map((line) => (
            <li key={line.id} className="flex items-start gap-3 text-ui text-foreground" data-testid={`admin-cleanup-turn-on-who-${line.id}`}>
              <Icon icon={line.icon} className="mt-0.5 text-muted-foreground" />
              <p className="min-w-0 flex-1">
                {line.lead && <strong className="font-semibold">{line.lead} </strong>}
                {line.text}
              </p>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
