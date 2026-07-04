"use client"

import { SlideFrame } from "@/components/wrapped/cinematic/slide-frame"
import { MovieData, WrappedSection } from "@/types/wrapped"

import { TopBillingList } from "./top-billing-list"

interface Props {
  section: WrappedSection
  shareToken?: string
}

export function CinematicTopMoviesSection({ section, shareToken }: Props) {
  const movies = (
    section.data && "movies" in section.data ? section.data.movies : []
  ) as MovieData[]

  return (
    <SlideFrame eyebrow="Top Billing — Films" title={section.title} narrative={section.content}>
      <TopBillingList entries={movies.slice(0, 5)} shareToken={shareToken} />
    </SlideFrame>
  )
}
