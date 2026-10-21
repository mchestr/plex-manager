import type { Metadata } from "next"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { StatusScreen } from "@/components/ui/status-screen"
import { nextAuthError } from "@/lib/ui/flash-codes"
import { icons } from "@/lib/ui/icons"

export const metadata: Metadata = { title: "Sign-in didn't finish" }

interface AuthErrorPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

/**
 * NextAuth's error page (`pages.error`, UI-07): a known `?error=` code gets its
 * copy and is shown in mono; anything else gets the `Default` copy. The query
 * text never reaches the page (SEC-20).
 */
export default async function AuthErrorPage({ searchParams }: AuthErrorPageProps) {
  const error = nextAuthError((await searchParams).error)
  return (
    <div className="flex w-full justify-center" data-testid="auth-error-page">
      <StatusScreen
        icon={icons.warning}
        code={error.code}
        title={error.title}
        titleTestId="auth-error-heading"
        description={error.description}
        primaryAction={
          <Button size="lg" nativeButton={false} render={<Link href="/" />} data-testid="auth-error-retry">
            Try again
          </Button>
        }
      />
    </div>
  )
}
