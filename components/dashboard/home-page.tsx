import { Suspense } from "react"

import { AnnouncementsCard } from "@/components/dashboard/announcements-card"
import { HelpCard } from "@/components/dashboard/help-card"
import { MembershipLinkCard } from "@/components/dashboard/membership-link-card"
import { NewOnRow, NewOnRowSkeleton } from "@/components/dashboard/new-on-row"
import { QuickLinks } from "@/components/dashboard/quick-links"
import { RequestLimits } from "@/components/dashboard/request-limits"
import { RewindCard } from "@/components/dashboard/rewind-card"
import { WatchlistSyncCard } from "@/components/watchlist/sync-settings-card"
import { getHomeData } from "@/lib/member/home-data"
import { requestRewindCardModel } from "@/lib/rewind/home-card"

interface HomePageProps {
  userId: string
  isAdmin: boolean
}

/**
 * The signed-in home (P10.21), in the order of `home.html`: the greeting, the
 * RewindCard, announcements, the "New on" poster row (Plex members, P10.12),
 * quick links, watchlist sync, request limits, membership and help. Two columns from `lg`; below it one column in
 * reading order. Nothing on it animates forever (UI-15).
 */
export async function HomePage({ userId, isAdmin }: HomePageProps) {
  // The layout's nav reads the same card model, so this is a cache hit (P6.9)
  const [data, rewindCard] = await Promise.all([getHomeData(userId), requestRewindCardModel(userId, isAdmin)])

  return (
    <div className="flex flex-1 flex-col" data-testid="home-page">
      <div className="mx-auto w-full max-w-280 flex-1 px-4 pt-6 pb-10 sm:px-6 md:pt-10 md:pb-14 lg:px-8">
        <header className="mb-5 flex flex-col gap-1.5 md:mb-7">
          <h1 className="text-display text-foreground" data-testid="home-greeting">
            {data.greeting}
          </h1>
          <p className="text-body text-muted-foreground">{data.since}</p>
        </header>

        <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
          <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-6">
            {rewindCard && (
              <div className="order-1 lg:order-none">
                <RewindCard {...rewindCard} />
              </div>
            )}
            {data.service === "plex" && (
              <div className="order-3 min-w-0 empty:hidden lg:order-none">
                {/* Its own boundary: a slow or unreachable Plex never holds up home */}
                <Suspense fallback={<NewOnRowSkeleton />}>
                  <NewOnRow
                    userId={userId}
                    isAdmin={isAdmin}
                    serverName={data.serverName}
                    browseUrl={data.quickLinks.media.find((server) => server.service === "plex")?.url ?? null}
                    format={data.format}
                  />
                </Suspense>
              </div>
            )}
            <div className="order-4 empty:hidden lg:order-none">
              <QuickLinks {...data.quickLinks} />
            </div>
            <div className="order-5 empty:hidden lg:order-none">
              <WatchlistSyncCard initialSettings={data.watchlist} service={data.service} />
            </div>
            <div className="order-5 min-w-0 empty:hidden lg:order-none">
              <Suspense fallback={null}>
                <RequestLimits userId={userId} />
              </Suspense>
            </div>
          </div>
          <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-6">
            {data.announcements.length > 0 && (
              <div className="order-2 lg:order-none">
                <AnnouncementsCard announcements={data.announcements} seenAt={data.announcementsSeenAt} />
              </div>
            )}
            {data.hasSubscription && (
              <div className="order-6 lg:order-none">
                <MembershipLinkCard />
              </div>
            )}
            <div className="order-7 lg:order-none">
              <HelpCard service={data.service} supportChannelUrl={data.supportChannelUrl} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
