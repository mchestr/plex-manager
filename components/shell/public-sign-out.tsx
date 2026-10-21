"use client"

import { useSignOut } from "@/components/shell/use-sign-out"
import { Button } from "@/components/ui/button"

/** PublicShell's ghost Sign out, the escape for a signed-in member on a public page (UI-37). */
export function PublicSignOut() {
  const signOut = useSignOut()
  return (
    <Button variant="ghost" size="sm" onClick={signOut} data-testid="public-shell-sign-out">
      Sign out
    </Button>
  )
}
