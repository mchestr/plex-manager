import type { Metadata } from "next"
import Link from "next/link"
import { getServerSession } from "next-auth"
import { redirect } from "next/navigation"

import { NotifySwitch } from "@/components/account/notify-switch"
import { TimezoneField } from "@/components/account/timezone-field"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { authOptions } from "@/lib/auth"
import { discordHandleFor } from "@/lib/member/shell"
import { prisma } from "@/lib/prisma"
import { serverZone } from "@/lib/utils/server-zone"
import { timeZoneOptions } from "@/lib/utils/zoned-time"
import { getSeasonState } from "@/lib/wrapped/season"

export const dynamic = "force-dynamic"

export const metadata: Metadata = { title: "Account" }

async function rewindNotify(userId: string): Promise<boolean> {
  const { seasonYear: year } = await getSeasonState()
  const prefs = await prisma.rewindPrefs.findUnique({
    where: { userId_year: { userId, year } },
    select: { notify: true },
  })
  // No row yet: the column's default, on.
  return prefs?.notify ?? true
}

/**
 * The member's account settings (ui-design-system 6.1, UI-30): Discord,
 * the Rewind ready notification, and the time zone. Appearance takes its
 * place after Time zone once P10.10 adds the light theme.
 */
export default async function AccountPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect("/")
  const userId = session.user.id

  const [user, discordHandle, notify, zone] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } }),
    discordHandleFor(userId),
    rewindNotify(userId),
    serverZone(),
  ])

  return (
    <div className="px-4 py-10 sm:px-6">
      <div className="mx-auto flex w-full max-w-140 flex-col gap-6">
        <h1 className="text-h1 text-foreground">Account</h1>

        {discordHandle !== undefined && (
          <Card data-testid="account-discord">
            <CardHeader className="pb-5">
              <CardTitle>Discord</CardTitle>
              <CardDescription>
                {discordHandle ? `Linked as ${discordHandle}` : "Link Discord to get the Member role on the server."}
              </CardDescription>
              <CardAction>
                <Button
                  variant={discordHandle ? "secondary" : "primary"}
                  size="sm"
                  nativeButton={false}
                  render={<Link href="/discord/link" />}
                  data-testid="account-discord-link"
                >
                  {discordHandle ? "Manage" : "Link Discord"}
                </Button>
              </CardAction>
            </CardHeader>
          </Card>
        )}

        <Card data-testid="account-notifications">
          <CardHeader>
            <CardTitle>Notifications</CardTitle>
          </CardHeader>
          <CardContent>
            <NotifySwitch notify={notify} />
          </CardContent>
        </Card>

        <Card data-testid="account-timezone-section">
          <CardHeader>
            <CardTitle>Time zone</CardTitle>
          </CardHeader>
          <CardContent>
            <TimezoneField value={user?.timezone ?? null} serverZone={zone} options={timeZoneOptions()} />
          </CardContent>
        </Card>

        {/* Appearance: P10.10 adds it here, behind the light-theme flag. */}
      </div>
    </div>
  )
}
