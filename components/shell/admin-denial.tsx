import type { Route } from "next"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { StatusScreen } from "@/components/ui/status-screen"
import type { AuthErrorKind } from "@/lib/auth-errors"
import { authCopy } from "@/lib/ui/error-copy"
import { icons } from "@/lib/ui/icons"

const SIGN_IN_HREF = "/?callbackUrl=/admin" as Route

/**
 * The admin gate's denial (ui-design-system 6.7): "Sign in to continue" or
 * "Admins only" as a StatusScreen. The admin layout draws it inside
 * PublicShell, so a non-admin never sees the sidebar; a page or boundary
 * inside the shell draws it bare. The test ids are the ones P6.1's screens had.
 */
export function AdminDenial({ reason }: { reason: AuthErrorKind }) {
  const copy = authCopy(reason)
  if (reason === "unauthenticated") {
    return (
      <div className="flex w-full justify-center" data-testid="unauthenticated-error-page">
        <StatusScreen
          icon={icons.signIn}
          code="401"
          title={copy.title}
          description={copy.description}
          primaryAction={
            <Button size="lg" nativeButton={false} render={<Link href={SIGN_IN_HREF} />} data-testid="admin-denial-sign-in">
              Continue with Plex
            </Button>
          }
        />
      </div>
    )
  }
  return (
    <div className="flex w-full justify-center" data-testid="unauthorized-error-page">
      <StatusScreen
        icon={icons.forbidden}
        code="403"
        title={copy.title}
        description={copy.description}
        primaryAction={
          <Button size="lg" nativeButton={false} render={<Link href="/" />} data-testid="go-home-button">
            Back to home
          </Button>
        }
      />
    </div>
  )
}
