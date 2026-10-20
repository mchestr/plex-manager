/**
 * Prompt template system with placeholder replacement (Wrapped v2).
 *
 * The system prompt defines the cinematic narrator voice and explains each
 * creative field the LLM must fill. The output *shape* is enforced by the
 * API (structured outputs) and Zod — the prompt only guides content quality.
 * The user prompt is a data-only template with `{{placeholder}}` values.
 *
 * Server-only: it reads the active template from the database. The prompt
 * texts themselves live in `lib/wrapped/prompt-text.ts`, which client
 * components import.
 */

import "server-only"

import { prisma } from "@/lib/prisma"
import { formatDuration } from "@/lib/utils/format"
import { suggestArchetypes } from "@/lib/wrapped/archetype-scoring"
import { getDefaultPromptTemplate } from "@/lib/wrapped/prompt-text"
import { WrappedStatistics } from "@/types/wrapped"

export { generateSystemPrompt } from "@/lib/wrapped/prompt-text"

/**
 * Available placeholders and their replacement logic
 */
interface PlaceholderContext {
  userName: string
  year: number
  statistics: WrappedStatistics
}

/**
 * Replace placeholders in a template string with actual values
 */
function replacePlaceholders(template: string, context: PlaceholderContext): string {
  const { userName, year, statistics } = context
  const derived = statistics.derived
  const serverName = statistics.serverStats?.serverName || ""

  // Build replacement map
  const replacements: Record<string, string> = {
    // Basic placeholders
    userName: userName,
    year: year.toString(),

    // Watch time placeholders
    totalWatchTime: formatDuration(statistics.totalWatchTime.total, "long", { largestUnit: "day" }),
    totalWatchTimeMinutes: statistics.totalWatchTime.total.toString(),
    moviesWatchTime: formatDuration(statistics.totalWatchTime.movies, "long", { largestUnit: "day" }),
    moviesWatchTimeMinutes: statistics.totalWatchTime.movies.toString(),
    showsWatchTime: formatDuration(statistics.totalWatchTime.shows, "long", { largestUnit: "day" }),
    showsWatchTimeMinutes: statistics.totalWatchTime.shows.toString(),

    // Content count placeholders
    moviesWatched: statistics.moviesWatched.toString(),
    showsWatched: statistics.showsWatched.toString(),
    episodesWatched: statistics.episodesWatched.toString(),

    // Top movies list
    topMoviesList: statistics.topMovies.slice(0, 5).map((movie, idx) =>
      `${idx + 1}. ${movie.title}${movie.year ? ` (${movie.year})` : ""} - ${formatDuration(movie.watchTime, "long", { largestUnit: "day" })} watched (${movie.watchTime} minutes)`
    ).join("\n"),

    // Top shows list
    topShowsList: statistics.topShows.slice(0, 5).map((show, idx) =>
      `${idx + 1}. ${show.title}${show.year ? ` (${show.year})` : ""} - ${formatDuration(show.watchTime, "long", { largestUnit: "day" })} watched (${show.watchTime} minutes), ${show.episodesWatched} episodes`
    ).join("\n"),

    // Top movies JSON (for data sections)
    topMoviesJson: JSON.stringify(statistics.topMovies.slice(0, 5)),

    // Top shows JSON (for data sections)
    topShowsJson: JSON.stringify(statistics.topShows.slice(0, 5)),

    // Derived viewing patterns (v2)
    longestStreak: derived?.longestStreak
      ? `${derived.longestStreak.days} consecutive days (${derived.longestStreak.start} to ${derived.longestStreak.end})`
      : "No streak data available",
    peakHour: derived?.peakHour
      ? `${derived.peakHour.label} (${derived.peakHour.plays} plays started in this hour)`
      : "No peak hour data available",
    peakDayOfWeek: derived
      ? [...derived.dayOfWeekHistogram].sort((a, b) => b.watchTime - a.watchTime)[0]?.day || "Unknown"
      : "Unknown",
    derivedStatsSection: derived ? `
**Viewing Patterns:**
- Longest streak: ${derived.longestStreak ? `${derived.longestStreak.days} consecutive days (${derived.longestStreak.start} to ${derived.longestStreak.end})` : "none"}
- Peak viewing hour: ${derived.peakHour ? `${derived.peakHour.label} (${derived.peakHour.plays} plays)` : "unknown"}
- Watch time by day of week: ${derived.dayOfWeekHistogram.map(d => `${d.day}: ${formatDuration(d.watchTime, "long", { largestUnit: "day" })}`).join(", ")}
- Weekend share of watch time: ${derived.weekendVsWeekday.weekendPct}%
- Most active single day: ${derived.mostActiveDay ? `${derived.mostActiveDay.date} (${formatDuration(derived.mostActiveDay.watchTime, "long", { largestUnit: "day" })})` : "unknown"}
` : "",

    // Server percentile (v2, conditional)
    percentileSection: statistics.percentile ? `
**Server Standing:**
- You are in the ${statistics.percentile.topPercentLabel} of viewers on this server by watch time${statistics.leaderboards?.watchTime.userPosition ? ` (ranked #${statistics.leaderboards.watchTime.userPosition} of ${statistics.leaderboards.watchTime.totalUsers})` : ""}
` : "",

    // Archetype candidates (v2): deterministic shortlist, best data fit
    // first, so the LLM cannot converge on the same pick for every user.
    archetypeCandidates: suggestArchetypes(statistics)
      .map(
        (a, idx) =>
          `${idx + 1}. ${a.id}: "${a.name}" — ${a.motif} (evidence: ${a.evidence})`
      )
      .join("\n"),

    // Leaderboard section (conditional)
    leaderboardSection: statistics.leaderboards ? `
**Leaderboard Stats:**

**Your Position in Overall Watch Time Leaderboard:**
${statistics.leaderboards.watchTime.userPosition
  ? `You ranked #${statistics.leaderboards.watchTime.userPosition} out of ${statistics.leaderboards.watchTime.totalUsers} users with ${formatDuration(statistics.totalWatchTime.total, "long", { largestUnit: "day" })} total watch time (${statistics.totalWatchTime.total} minutes)`
  : `You watched ${formatDuration(statistics.totalWatchTime.total, "long", { largestUnit: "day" })} total (${statistics.totalWatchTime.total} minutes) out of ${statistics.leaderboards.watchTime.totalUsers} users`}

**Top Movies Leaderboards (all watch times in minutes):**
${statistics.leaderboards.topContent.movies.map((movie) => {
  const positionText = movie.userPosition
    ? `#${movie.userPosition} out of ${movie.totalWatchers} watchers`
    : `watched by ${movie.totalWatchers} users`
  const topWatcher = movie.leaderboard[0]
  const topWatcherText = topWatcher && topWatcher.watchTime > 0
    ? `The top watcher watched ${formatDuration(topWatcher.watchTime, "long", { largestUnit: "day" })} (${topWatcher.watchTime} minutes)`
    : ""
  return `- ${movie.title}: Your position: ${positionText}. ${topWatcherText}`
}).join("\n")}

**Top Shows Leaderboards (all watch times in minutes):**
${statistics.leaderboards.topContent.shows.map((show) => {
  const positionText = show.userPosition
    ? `#${show.userPosition} out of ${show.totalWatchers} watchers`
    : `watched by ${show.totalWatchers} users`
  const topWatcher = show.leaderboard[0]
  const topWatcherText = topWatcher && topWatcher.watchTime > 0
    ? `The top watcher watched ${formatDuration(topWatcher.watchTime, "long", { largestUnit: "day" })} (${topWatcher.watchTime} minutes, ${topWatcher.episodesWatched} episodes)`
    : ""
  return `- ${show.title}: Your position: ${positionText}. ${topWatcherText}`
}).join("\n")}
` : "",

    // Server stats section (conditional)
    serverStatsSection: statistics.serverStats ? `
**Plex Server Statistics:**
- Server name: ${serverName}
- Total storage: ${statistics.serverStats.totalStorageFormatted}
- Library size:
  - Movies: ${statistics.serverStats.librarySize.movies.toLocaleString()}
  - Shows: ${statistics.serverStats.librarySize.shows.toLocaleString()}
  - Episodes: ${statistics.serverStats.librarySize.episodes.toLocaleString()}
` : "",

    // Overseerr stats section (conditional)
    overseerrStatsSection: statistics.overseerrStats ? `
**Overseerr Requests:**
- Your requests: ${statistics.overseerrStats.totalRequests}
- Total server requests: ${statistics.overseerrStats.totalServerRequests}
- Pending: ${statistics.overseerrStats.pendingRequests}
- Top genres: ${statistics.overseerrStats.topRequestedGenres.map(g => g.genre).join(", ")}
` : "",

    // Watch time by month section (conditional)
    watchTimeByMonthSection: statistics.watchTimeByMonth && statistics.watchTimeByMonth.length > 0 ? `
**Watch Time by Month (all times in minutes):**
${statistics.watchTimeByMonth.map(month => {
  const watchTimeText = `${formatDuration(month.watchTime, "long", { largestUnit: "day" })} (${month.watchTime} minutes)`
  const movieText = month.topMovie
    ? ` | Top Movie: ${month.topMovie.title}${month.topMovie.year ? ` (${month.topMovie.year})` : ""} - ${formatDuration(month.topMovie.watchTime, "long", { largestUnit: "day" })} (${month.topMovie.watchTime} minutes)`
    : ""
  const showText = month.topShow
    ? ` | Top Show: ${month.topShow.title}${month.topShow.year ? ` (${month.topShow.year})` : ""} - ${formatDuration(month.topShow.watchTime, "long", { largestUnit: "day" })} (${month.topShow.watchTime} minutes), ${month.topShow.episodesWatched} episodes`
    : ""
  return `- ${month.monthName}: ${watchTimeText}${movieText}${showText}`
}).join("\n")}
` : "",

    // Server name (if available)
    serverName,

    // Deprecated placeholders — resolve to empty so existing custom DB
    // templates keep rendering without stale scaffolding. bingeWatcher and
    // discoveryScore fed LLM-computed fields that left the contract (RWP-16).
    bingeWatcher: "",
    discoveryScore: "",
    overseerrSectionJson: "",
    overseerrAnimationDelay: "",
    insightsAnimationDelay: "",
    funFactsAnimationDelay: "",
    serverStatsFacts: "",
    serverStatsContent: "",
  }

  // One pass with a replacer function (SEC-46): a value is inserted literally,
  // so "$&" or "$'" in a title stays text, and a value is never scanned for
  // placeholders again. Unknown placeholders are left as written.
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => (Object.hasOwn(replacements, key) ? replacements[key] : match))
}

/**
 * Generate the prompt for LLM to create wrapped content using template system
 */
export async function generateWrappedPrompt(
  userName: string,
  year: number,
  statistics: WrappedStatistics,
  templateString?: string
): Promise<string> {
  // If template string is provided, use it; otherwise get active template from database
  let finalTemplateString: string
  if (templateString) {
    finalTemplateString = templateString
  } else {
    const template = await prisma.promptTemplate.findFirst({ where: { isActive: true } })
    finalTemplateString = template?.template || getDefaultPromptTemplate()
  }

  // Replace placeholders with actual values
  return replacePlaceholders(finalTemplateString, { userName, year, statistics })
}
