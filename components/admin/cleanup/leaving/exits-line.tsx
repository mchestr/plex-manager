import Link from "next/link"

import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"
import { cleanup } from "@/lib/admin/routes"
import { type ExitCounts, exitsLine } from "@/lib/cleanup/outcomes"
import { icons } from "@/lib/ui/icons"

/**
 * "In the last 7 days, 9 titles left Leaving soon: 4 kept by members, 3
 * played, 2 for other reasons." and "Open history" (UX 4.7.2). It hides at 0.
 */
export function ExitsLine({ exits }: { exits: ExitCounts }) {
  const words = exitsLine(exits)
  if (words === null) return null
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-ui text-foreground" data-testid="admin-cleanup-leaving-exits">
      <Icon icon={icons.conversationHistory} className="text-muted-foreground" />
      <span>{words}</span>
      <Button
        variant="link"
        size="sm"
        className="h-auto px-0"
        nativeButton={false}
        render={<Link href={cleanup({ tab: "history" })} />}
        data-testid="admin-cleanup-leaving-exits-history"
      >
        Open history
      </Button>
    </p>
  )
}
