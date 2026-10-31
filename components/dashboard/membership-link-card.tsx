import Link from "next/link"

import { Button } from "@/components/ui/button"
import { Card, CardAction, CardHeader, CardTitle } from "@/components/ui/card"

/** Home's membership card: the plan, renewal and billing live on `/membership` (UI-37). */
export function MembershipLinkCard() {
  return (
    <Card data-testid="home-membership-card">
      <CardHeader>
        <CardTitle>Membership</CardTitle>
        <CardAction>
          <Button
            variant="secondary"
            size="sm"
            nativeButton={false}
            render={<Link href="/membership" />}
            data-testid="home-membership-link"
          >
            View membership
          </Button>
        </CardAction>
      </CardHeader>
    </Card>
  )
}
