"use client"

import { usePathname } from "next/navigation"

import { SubscriptionBanners } from "@/components/subscription/subscription-banners"
import { Alert } from "@/components/ui/alert"
import { noticeShownOn, type MemberNotice } from "@/lib/member/notice-rules"

function NoticeBody({ notice }: { notice: MemberNotice }) {
  switch (notice.kind) {
    case "past-due":
    case "pending-invite":
      return <SubscriptionBanners notice={notice.kind} />
    case "outage":
      return (
        <Alert tone="warning" title={`${notice.serviceName || "The server"} is down`} data-testid="outage-banner">
          Playback may not work right now. This notice goes away when it is back up.
        </Alert>
      )
    case "rewind-ready":
      // P7.14 writes this notice and its "Open Rewind" action.
      return null
  }
}

/**
 * The member shell's one notice, under the top bar (ui-design-system 6.1).
 * It applies the page rule on the client, because the layout that picked
 * the notice does not re-render on client navigation.
 */
export function AppNotice({ notice }: { notice: MemberNotice }) {
  const pathname = usePathname() ?? "/"
  if (!noticeShownOn(notice, pathname)) return null
  return (
    <div className="mx-auto w-full max-w-6xl px-4 pt-4 sm:px-6" data-testid="app-notice">
      <NoticeBody notice={notice} />
    </div>
  )
}
