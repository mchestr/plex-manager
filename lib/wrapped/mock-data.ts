/**
 * Mock data generation for when LLM is disabled
 * This allows development/testing without making API calls
 */

import { formatWatchTime } from "@/lib/utils/time-formatting"
import { WrappedData, WrappedSection, WrappedStatistics } from "@/types/wrapped"

/**
 * Generate mock wrapped data when LLM is disabled
 */
export function generateMockWrappedData(
  userName: string,
  year: number,
  userId: string,
  statistics: WrappedStatistics
): WrappedData {
  const totalWatchTime = formatWatchTime(statistics.totalWatchTime.total)
  const topMovie = statistics.topMovies[0]
  const topShow = statistics.topShows[0]

  const sections: WrappedSection[] = [
    {
      id: "hero",
      type: "hero",
      title: `Your ${year} Plex Wrapped`,
      subtitle: "",
      content: `You've watched ${totalWatchTime} of content this year. That's impressive!`,
      animationDelay: 0,
    },
    {
      id: "total-watch-time",
      type: "total-watch-time",
      title: "Total Watch Time",
      subtitle: "You've been busy!",
      content: `You spent ${totalWatchTime} watching content this year. That's ${statistics.totalWatchTime.total} minutes of pure entertainment!`,
      data: {
        total: statistics.totalWatchTime.total,
        movies: statistics.totalWatchTime.movies,
        shows: statistics.totalWatchTime.shows,
      },
      animationDelay: 500,
    },
    {
      id: "movies-breakdown",
      type: "movies-breakdown",
      title: "Movies Watched",
      subtitle: "Your cinematic journey",
      content: `You watched ${statistics.moviesWatched} movies this year, totaling ${formatWatchTime(statistics.totalWatchTime.movies)}.`,
      data: {
        count: statistics.moviesWatched,
        watchTime: statistics.totalWatchTime.movies,
      },
      animationDelay: 1000,
    },
    {
      id: "shows-breakdown",
      type: "shows-breakdown",
      title: "Shows Watched",
      subtitle: "Your binge-watching adventures",
      content: `You watched ${statistics.showsWatched} shows with ${statistics.episodesWatched} episodes, totaling ${formatWatchTime(statistics.totalWatchTime.shows)}.`,
      data: {
        count: statistics.showsWatched,
        episodes: statistics.episodesWatched,
        watchTime: statistics.totalWatchTime.shows,
      },
      animationDelay: 1500,
    },
    {
      id: "top-movies",
      type: "top-movies",
      title: "Your Top Movies",
      subtitle: "The films you loved most",
      content: topMovie
        ? `Your top movie was ${topMovie.title}, which you watched for ${formatWatchTime(topMovie.watchTime)}.`
        : "You watched some great movies this year!",
      data: {
        movies: statistics.topMovies.slice(0, 5),
      },
      animationDelay: 2000,
    },
    {
      id: "top-shows",
      type: "top-shows",
      title: "Your Top Shows",
      subtitle: "The series that kept you coming back",
      content: topShow
        ? `Your top show was ${topShow.title}, which you watched for ${formatWatchTime(topShow.watchTime)} across ${topShow.episodesWatched} episodes.`
        : "You watched some amazing shows this year!",
      data: {
        shows: statistics.topShows.slice(0, 5),
      },
      animationDelay: 2500,
    },
  ]

  // Add Overseerr stats section if available
  if (statistics.overseerrStats) {
    sections.push({
      id: "overseerr-stats",
      type: "overseerr-stats",
      title: "Your Requests",
      subtitle: "Building your perfect library",
      content: `You made ${statistics.overseerrStats.totalRequests} requests this year, with ${statistics.overseerrStats.approvedRequests} approved.`,
      animationDelay: 3000,
    })
  }

  // Build fun facts array
  const funFacts: string[] = [
    `You watched ${statistics.moviesWatched} movies and ${statistics.showsWatched} shows`,
    `Your total watch time was ${totalWatchTime}`,
    topMovie ? `Your most watched movie was ${topMovie.title}` : "You explored many different movies",
    topShow ? `Your most watched show was ${topShow.title}` : "You explored many different shows",
    `You watched ${statistics.episodesWatched} episodes total`,
  ]

  // Add server stats facts if available
  if (statistics.serverStats) {
    funFacts.push(
      `${statistics.serverStats.serverName} has ${statistics.serverStats.librarySize.movies.toLocaleString()} movies and ${statistics.serverStats.librarySize.shows.toLocaleString()} shows in its library`,
      `${statistics.serverStats.serverName} has ${statistics.serverStats.totalStorageFormatted} of total storage`
    )
  }

  sections.push(
    {
      id: "insights",
      type: "insights",
      title: "Your Viewing Personality",
      subtitle: "What your stats say about you",
      content: `You're a dedicated viewer who enjoys both movies and shows. Your viewing habits show a love for entertainment and storytelling.`,
      animationDelay: statistics.overseerrStats ? 4000 : 3000,
    },
    {
      id: "fun-facts",
      type: "fun-facts",
      title: "Fun Facts & Server Stats",
      subtitle: "Did you know?",
      content: statistics.serverStats
        ? `Here are some fun facts about your viewing habits and ${statistics.serverStats.serverName}:`
        : "Here are some fun facts about your viewing habits:",
      data: {
        facts: funFacts,
      },
      animationDelay: statistics.overseerrStats ? 5000 : statistics.serverStats ? 4000 : 3000,
    }
  )

  return {
    year,
    userId,
    userName,
    generatedAt: new Date().toISOString(),
    statistics,
    sections,
    insights: {
      personality: "Entertainment Enthusiast",
      topGenre: "Various",
      bingeWatcher: statistics.totalWatchTime.shows > statistics.totalWatchTime.movies,
      discoveryScore: 50,
      funFacts: [
        `You watched ${statistics.moviesWatched} movies this year`,
        `Your total watch time was ${totalWatchTime}`,
        topMovie ? `Your favorite movie was ${topMovie.title}` : "You explored many genres",
      ],
    },
    summary: `In ${year}, I watched ${totalWatchTime} of content! ${topMovie ? `My top movie was ${topMovie.title}` : "I explored many amazing films"} and I binged ${statistics.showsWatched} shows with ${statistics.episodesWatched} episodes. What a year!`,
    metadata: {
      totalSections: sections.length,
      generationTime: 0,
    },
  }
}

