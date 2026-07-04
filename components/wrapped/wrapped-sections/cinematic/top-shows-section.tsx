"use client"

import { SlideFrame } from "@/components/wrapped/cinematic/slide-frame"
import { ShowData, WrappedSection } from "@/types/wrapped"

import { TopBillingList } from "./top-billing-list"

interface Props {
  section: WrappedSection
  shareToken?: string
}

export function CinematicTopShowsSection({ section, shareToken }: Props) {
  const shows = (
    section.data && "shows" in section.data ? section.data.shows : []
  ) as ShowData[]

  return (
    <SlideFrame eyebrow="Top Billing — Series" title={section.title} narrative={section.content}>
      <TopBillingList entries={shows.slice(0, 5)} shareToken={shareToken} />
    </SlideFrame>
  )
}
