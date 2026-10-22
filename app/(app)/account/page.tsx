import type { Metadata } from "next"
import Link from "next/link"
import { getServerSession } from "next-auth"
import { redirect } from "next/navigation"

import { AppearancePicker } from "@/components/account/appearance-picker"
import { NotifySwitch } from "@/components/account/notify-switch"
import { TimezoneField } from "@/components/account/timezone-field"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { authOptions } from "@/lib/auth"
import { getAssistantDisclosure } from "@/lib/llm/assistant-disclosure"
import { getAppSettings } from "@/lib/settings/app-settings"
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
 * the Rewind ready notification, the time zone, Appearance while the
 * light theme's flag is on (P10.10), and what admins can see (P11.16).
 */
export default async function AccountPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) redirect("/")
  const userId = session.user.id

  const [user, discordHandle, notify, zone, { lightThemeEnabled }, assistantDisclosure] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { timezone: true } }),
    discordHandleFor(userId),
    rewindNotify(userId),
    serverZone(),
    getAppSettings(),
    getAssistantDisclosure(),
  ])

  return (
    <div className="px-4 py-10 sm:px-6">
      <div className="mx-auto flex w-full max-w-140 flex-col gap-6">
        <h1 className="text-h1 text-foreground">Account</h1>

        {discordHandle !== undefined && (
          <Card data-testid="account-discord">
            <CardHeader className="pb-5">
              <CardTitle as="h2">Discord</CardTitle>
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
            <CardTitle as="h2">Notifications</CardTitle>
          </CardHeader>
          <CardContent>
            <NotifySwitch notify={notify} />
          </CardContent>
        </Card>

        <Card data-testid="account-timezone-section">
          <CardHeader>
            <CardTitle as="h2">Time zone</CardTitle>
          </CardHeader>
          <CardContent>
            <TimezoneField value={user?.timezone ?? null} serverZone={zone} options={timeZoneOptions()} />
          </CardContent>
        </Card>

        {lightThemeEnabled && (
          <Card data-testid="account-appearance">
            <CardHeader>
              <CardTitle as="h2">Appearance</CardTitle>
            </CardHeader>
            <CardContent>
              <AppearancePicker testId="account-appearance-picker" />
            </CardContent>
          </Card>
        )}

        <Card data-testid="account-your-data">
          <CardHeader>
            <CardTitle as="h2">Your data</CardTitle>
            <CardDescription>
              Server admins can see your watch activity and your Rewind. {assistantDisclosure}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    </div>
  )
}
