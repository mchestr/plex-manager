import type { Route } from "next"
import Link from "next/link"
import { X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Icon } from "@/components/ui/icon"

/**
 * Rewind's Close control: a link back to where the member came from
 * (`safeReturnPath(?from=)`), drawn as an ink-outline pill. The status panels
 * carry it, and the story chrome draws the same control (P5.2).
 */
export function RewindClose({ href }: { href: Route }) {
  return (
    <Button
      variant="ink-outline"
      size="icon-pill"
      aria-label="Close"
      data-testid="rewind-close"
      nativeButton={false}
      render={<Link href={href} />}
    >
      <Icon icon={X} size={20} />
    </Button>
  )
}
