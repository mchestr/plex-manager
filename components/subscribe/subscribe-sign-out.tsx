"use client"

import { useSignOut } from "@/components/shell/use-sign-out"
import { Button } from "@/components/ui/button"

/** The unavailable screen's Sign out, its way out when there is no Discord to ask on (UI-37). */
export function SubscribeSignOut({ variant }: { variant: "primary" | "secondary" }) {
  const signOut = useSignOut()
  return (
    <Button size="lg" variant={variant} onClick={signOut} data-testid="subscribe-sign-out">
      Sign out
    </Button>
  )
}
