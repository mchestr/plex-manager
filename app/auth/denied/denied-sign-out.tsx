"use client"

import { useSignOut } from "@/components/shell/use-sign-out"
import { Button } from "@/components/ui/button"

/** The denied screen's Sign out: clears any session and lands on sign-in. */
export function DeniedSignOut({ variant }: { variant: "primary" | "secondary" }) {
  const signOut = useSignOut()
  return (
    <Button size="lg" variant={variant} onClick={signOut} data-testid="denied-sign-out">
      Sign out
    </Button>
  )
}
