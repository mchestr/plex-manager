/**
 * Prompt template system with placeholder replacement (Wrapped v2).
 *
 * The system prompt defines the cinematic narrator voice and explains each
 * creative field the LLM must fill. The output *shape* is enforced by the
 * API (structured outputs) and Zod — the prompt only guides content quality.
 * The user prompt is a data-only template with `{{placeholder}}` values.
 */

import { getActivePromptTemplate } from "@/actions/prompts"
import { formatWatchTime } from "@/lib/utils/time-formatting"
import { ARCHETYPES } from "@/lib/wrapped/llm-output-schema"
import { WrappedStatistics } from "@/types/wrapped"

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

  // Build replacement map
  const replacements: Record<string, string> = {
    // Basic placeholders
    "{{userName}}": userName,
    "{{year}}": year.toString(),

    // Watch time placeholders
    "{{totalWatchTime}}": formatWatchTime(statistics.totalWatchTime.total),
    "{{totalWatchTimeMinutes}}": statistics.totalWatchTime.total.toString(),
    "{{moviesWatchTime}}": formatWatchTime(statistics.totalWatchTime.movies),
    "{{moviesWatchTimeMinutes}}": statistics.totalWatchTime.movies.toString(),
    "{{showsWatchTime}}": formatWatchTime(statistics.totalWatchTime.shows),
    "{{showsWatchTimeMinutes}}": statistics.totalWatchTime.shows.toString(),

    // Content count placeholders
    "{{moviesWatched}}": statistics.moviesWatched.toString(),
    "{{showsWatched}}": statistics.showsWatched.toString(),
    "{{episodesWatched}}": statistics.episodesWatched.toString(),

    // Top movies list
    "{{topMoviesList}}": statistics.topMovies.slice(0, 5).map((movie, idx) =>
      `${idx + 1}. ${movie.title}${movie.year ? ` (${movie.year})` : ""} - ${formatWatchTime(movie.watchTime)} watched (${movie.watchTime} minutes)`
    ).join("\n"),

    // Top shows list
    "{{topShowsList}}": statistics.topShows.slice(0, 5).map((show, idx) =>
      `${idx + 1}. ${show.title}${show.year ? ` (${show.year})` : ""} - ${formatWatchTime(show.watchTime)} watched (${show.watchTime} minutes), ${show.episodesWatched} episodes`
    ).join("\n"),

    // Top movies JSON (for data sections)
    "{{topMoviesJson}}": JSON.stringify(statistics.topMovies.slice(0, 5)),

    // Top shows JSON (for data sections)
    "{{topShowsJson}}": JSON.stringify(statistics.topShows.slice(0, 5)),

    // Derived viewing patterns (v2)
    "{{longestStreak}}": derived?.longestStreak
      ? `${derived.longestStreak.days} consecutive days (${derived.longestStreak.start} to ${derived.longestStreak.end})`
      : "No streak data available",
    "{{peakHour}}": derived?.peakHour
      ? `${derived.peakHour.label} (${derived.peakHour.plays} plays started in this hour)`
      : "No peak hour data available",
    "{{peakDayOfWeek}}": derived
      ? [...derived.dayOfWeekHistogram].sort((a, b) => b.watchTime - a.watchTime)[0]?.day || "Unknown"
      : "Unknown",
    "{{derivedStatsSection}}": derived ? `
**Viewing Patterns:**
- Longest streak: ${derived.longestStreak ? `${derived.longestStreak.days} consecutive days (${derived.longestStreak.start} to ${derived.longestStreak.end})` : "none"}
- Peak viewing hour: ${derived.peakHour ? `${derived.peakHour.label} (${derived.peakHour.plays} plays)` : "unknown"}
- Watch time by day of week: ${derived.dayOfWeekHistogram.map(d => `${d.day}: ${formatWatchTime(d.watchTime)}`).join(", ")}
- Weekend share of watch time: ${derived.weekendVsWeekday.weekendPct}%
- Most active single day: ${derived.mostActiveDay ? `${derived.mostActiveDay.date} (${formatWatchTime(derived.mostActiveDay.watchTime)})` : "unknown"}
` : "",

    // Server percentile (v2, conditional)
    "{{percentileSection}}": statistics.percentile ? `
**Server Standing:**
- You are in the ${statistics.percentile.topPercentLabel} of viewers on this server by watch time${statistics.leaderboards?.watchTime.userPosition ? ` (ranked #${statistics.leaderboards.watchTime.userPosition} of ${statistics.leaderboards.watchTime.totalUsers})` : ""}
` : "",

    // Archetype candidates (v2)
    "{{archetypeCandidates}}": ARCHETYPES.map(
      (a) => `- ${a.id}: "${a.name}" — ${a.motif}`
    ).join("\n"),

    // Leaderboard section (conditional)
    "{{leaderboardSection}}": statistics.leaderboards ? `
**Leaderboard Stats:**

**Your Position in Overall Watch Time Leaderboard:**
${statistics.leaderboards.watchTime.userPosition
  ? `You ranked #${statistics.leaderboards.watchTime.userPosition} out of ${statistics.leaderboards.watchTime.totalUsers} users with ${formatWatchTime(statistics.totalWatchTime.total)} total watch time (${statistics.totalWatchTime.total} minutes)`
  : `You watched ${formatWatchTime(statistics.totalWatchTime.total)} total (${statistics.totalWatchTime.total} minutes) out of ${statistics.leaderboards.watchTime.totalUsers} users`}

**Top Movies Leaderboards (all watch times in minutes):**
${statistics.leaderboards.topContent.movies.map((movie) => {
  const positionText = movie.userPosition
    ? `#${movie.userPosition} out of ${movie.totalWatchers} watchers`
    : `watched by ${movie.totalWatchers} users`
  const topWatcher = movie.leaderboard[0]
  const topWatcherText = topWatcher && topWatcher.watchTime > 0
    ? `The top watcher watched ${formatWatchTime(topWatcher.watchTime)} (${topWatcher.watchTime} minutes)`
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
    ? `The top watcher watched ${formatWatchTime(topWatcher.watchTime)} (${topWatcher.watchTime} minutes, ${topWatcher.episodesWatched} episodes)`
    : ""
  return `- ${show.title}: Your position: ${positionText}. ${topWatcherText}`
}).join("\n")}
` : "",

    // Server stats section (conditional)
    "{{serverStatsSection}}": statistics.serverStats ? `
**Plex Server Statistics:**
- Server name: {{serverName}}
- Total storage: ${statistics.serverStats.totalStorageFormatted}
- Library size:
  - Movies: ${statistics.serverStats.librarySize.movies.toLocaleString()}
  - Shows: ${statistics.serverStats.librarySize.shows.toLocaleString()}
  - Episodes: ${statistics.serverStats.librarySize.episodes.toLocaleString()}
` : "",

    // Overseerr stats section (conditional)
    "{{overseerrStatsSection}}": statistics.overseerrStats ? `
**Overseerr Requests:**
- Your requests: ${statistics.overseerrStats.totalRequests}
- Total server requests: ${statistics.overseerrStats.totalServerRequests}
- Approved: ${statistics.overseerrStats.approvedRequests}
- Pending: ${statistics.overseerrStats.pendingRequests}
- Top genres: ${statistics.overseerrStats.topRequestedGenres.map(g => g.genre).join(", ")}
` : "",

    // Watch time by month section (conditional)
    "{{watchTimeByMonthSection}}": statistics.watchTimeByMonth && statistics.watchTimeByMonth.length > 0 ? `
**Watch Time by Month (all times in minutes):**
${statistics.watchTimeByMonth.map(month => {
  const watchTimeText = `${formatWatchTime(month.watchTime)} (${month.watchTime} minutes)`
  const movieText = month.topMovie
    ? ` | Top Movie: ${month.topMovie.title}${month.topMovie.year ? ` (${month.topMovie.year})` : ""} - ${formatWatchTime(month.topMovie.watchTime)} (${month.topMovie.watchTime} minutes)`
    : ""
  const showText = month.topShow
    ? ` | Top Show: ${month.topShow.title}${month.topShow.year ? ` (${month.topShow.year})` : ""} - ${formatWatchTime(month.topShow.watchTime)} (${month.topShow.watchTime} minutes), ${month.topShow.episodesWatched} episodes`
    : ""
  return `- ${month.monthName}: ${watchTimeText}${movieText}${showText}`
}).join("\n")}
` : "",

    // Server name (if available)
    "{{serverName}}": statistics.serverStats?.serverName || "",

    // Calculated values
    "{{bingeWatcher}}": statistics.topShows.some(s => s.episodesWatched > 20) ? "true" : "false",
    "{{discoveryScore}}": Math.min(100, Math.max(0, Math.floor((statistics.moviesWatched + statistics.showsWatched) / 10))).toString(),

    // Deprecated placeholders (v1 JSON-format era) — resolve to empty so
    // existing custom DB templates keep rendering without stale scaffolding
    "{{overseerrSectionJson}}": "",
    "{{overseerrAnimationDelay}}": "",
    "{{insightsAnimationDelay}}": "",
    "{{funFactsAnimationDelay}}": "",
    "{{serverStatsFacts}}": "",
    "{{serverStatsContent}}": "",
  }

  // Replace all placeholders
  // First pass: Replace complex placeholders that may contain other placeholders
  let result = template
  for (const [placeholder, value] of Object.entries(replacements)) {
    // Skip {{serverName}} in first pass - it will be replaced in second pass
    if (placeholder === "{{serverName}}") {
      continue
    }
    result = result.replace(new RegExp(placeholder.replace(/[{}]/g, "\\$&"), "g"), value)
  }

  // Second pass: Replace {{serverName}} after all other placeholders have been replaced
  // This ensures {{serverName}} works even when nested in other placeholder replacements
  result = result.replace(new RegExp("{{serverName}}".replace(/[{}]/g, "\\$&"), "g"), replacements["{{serverName}}"] || "")

  return result
}

/**
 * Generate the system prompt: narrator voice, field meanings, and archetype
 * selection guidance. Output shape is enforced by the API schema, so this
 * prompt contains no JSON scaffolding or format examples.
 */
export function generateSystemPrompt(): string {
  return `You are the narrator of a cinematic year-in-review — a "Plex Wrapped" presented as an awards-night premiere. You write in the register of a great awards-show host: warm, witty, a little grand, never cheesy. Think opening monologue at a film festival, written personally for tonight's honoree.

=== VOICE ===

1. PERSON: Always 2nd person ("you", "your") — never 3rd person.
2. TONE: Cinematic and celebratory. Draw on the language of film: premieres, marquees, screenings, double features, closing credits. Restraint over exclamation — one sharp image beats three exclamation points. No emoji.
3. HIGHLIGHT TAGS: Wrap ALL numbers, times, and stats in <highlight>tags</highlight> for visual impact.
4. WATCH TIME: Convert minutes to readable units (days, hours, minutes) — never show raw minutes.
5. SERVER REFERENCES: Use the server name only (e.g., "MikeFlix") — never say "Your Plex server" or "Your server"; the viewer does not own the server.
6. ACCURACY: Use only the real statistics provided. Never invent numbers, titles, or events.

=== WHAT YOU WRITE ===

You return a JSON object with four parts (the exact shape is enforced automatically — focus on the writing):

**archetype** — Choose the one viewer archetype from the provided candidate list whose motif is best supported by the data (viewing hours, streaks, rewatch behavior, breadth vs. depth, weekend share). Set "id" to its exact id. Write:
- "tagline": one marquee-worthy line that captures why this is them (no more than ~10 words).
- "dedication": 2-3 sentences in the style of an award citation, grounded in their actual numbers. This is the emotional peak of the experience — make it land.

**narratives** — One short passage (1-3 sentences each) that accompanies a stat-filled slide. The numbers are displayed separately; your text provides the story around them:
- "opening": the curtain-raiser. Welcome them to their year-in-review premiere.
- "totalWatchTime": their total hours on screen this year.
- "movies": their film count and film watch time.
- "shows": their series, episode count, and series watch time.
- "topMovies": introduces their most-watched films ("top billing").
- "topShows": introduces their most-watched series.
- "streaksAndPatterns": their longest daily streak, peak viewing hour, and weekly rhythm.
- "monthlyJourney": their year traced month by month — name an arc, a peak, or a quiet stretch.
- "percentile": their standing among the server's audience (null if no percentile data was provided).
- "serverStats": a nod to the server behind the curtain — its library and storage (null if no server data was provided).
- "overseerr": their media requests — what they brought to the library (null if no request data was provided).
- "finale": the closing credits. Thank them, land one last image, and hint at next year's sequel.

**insights** —
- "personality": a one-line viewing personality description.
- "topGenre": your best inference of their most-watched genre from the titles and request data provided.
- "bingeWatcher": true if any show has episodesWatched > 20, else false.
- "discoveryScore": min(100, max(0, floor((moviesWatched + showsWatched) / 10))).
- "funFacts": 3-7 standalone facts, each a single sentence, 2nd person, with <highlight>tags</highlight> around every number. Mix viewing-habit facts with server-library facts when server data is available.

**summary** — 2-3 shareable sentences capturing the most impressive stats of their year, written to be posted publicly. Include <highlight>tags</highlight> around numbers.

If a narrative's underlying data was not provided in the statistics, set that narrative to null rather than inventing content.`
}

/**
 * Get the default user prompt template (fallback if no template in database)
 * This should contain only the viewing statistics data, not instructions
 */
export function getDefaultPromptTemplate(): string {
  return `=== VIEWING STATISTICS FOR {{year}} ===

Here are the viewing statistics for {{userName}}:

**Watch Time (all values are in minutes, converted to days/hours/minutes for clarity):**
- Total watch time: {{totalWatchTime}} ({{totalWatchTimeMinutes}} minutes total)
- Movies watch time: {{moviesWatchTime}} ({{moviesWatchTimeMinutes}} minutes total)
- Shows watch time: {{showsWatchTime}} ({{showsWatchTimeMinutes}} minutes total)

**Content Watched:**
- Movies watched: {{moviesWatched}}
- Shows watched: {{showsWatched}}
- Episodes watched: {{episodesWatched}}

**Top Movies (by watch time - all times in minutes):**
{{topMoviesList}}

**Top Shows (by watch time - all times in minutes):**
{{topShowsList}}

{{derivedStatsSection}}

{{percentileSection}}

{{leaderboardSection}}

{{serverStatsSection}}

{{overseerrStatsSection}}

{{watchTimeByMonthSection}}

**Additional Context:**
- Server name: {{serverName}}
- Binge watcher calculation: {{bingeWatcher}} (true if any show has episodesWatched > 20)
- Discovery score: {{discoveryScore}} (calculated as min(100, max(0, floor((moviesWatched + showsWatched) / 10))))

**Archetype Candidates (choose exactly one id):**
{{archetypeCandidates}}

Generate the personalized Plex Wrapped content based on these statistics.`
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
    const template = await getActivePromptTemplate()
    finalTemplateString = template?.template || getDefaultPromptTemplate()
  }

  // Replace placeholders with actual values
  return replacePlaceholders(finalTemplateString, { userName, year, statistics })
}

/**
 * Get list of available placeholders for documentation
 */
export function getAvailablePlaceholders(): Array<{ placeholder: string; description: string }> {
  return [
    { placeholder: "{{userName}}", description: "User's name" },
    { placeholder: "{{year}}", description: "Year for the wrapped" },
    { placeholder: "{{totalWatchTime}}", description: "Total watch time formatted (e.g., '67 days, 3 hours, 15 minutes')" },
    { placeholder: "{{totalWatchTimeMinutes}}", description: "Total watch time in minutes" },
    { placeholder: "{{moviesWatchTime}}", description: "Movies watch time formatted" },
    { placeholder: "{{moviesWatchTimeMinutes}}", description: "Movies watch time in minutes" },
    { placeholder: "{{showsWatchTime}}", description: "Shows watch time formatted" },
    { placeholder: "{{showsWatchTimeMinutes}}", description: "Shows watch time in minutes" },
    { placeholder: "{{moviesWatched}}", description: "Number of movies watched" },
    { placeholder: "{{showsWatched}}", description: "Number of shows watched" },
    { placeholder: "{{episodesWatched}}", description: "Number of episodes watched" },
    { placeholder: "{{topMoviesList}}", description: "Formatted list of top 5 movies" },
    { placeholder: "{{topShowsList}}", description: "Formatted list of top 5 shows" },
    { placeholder: "{{topMoviesJson}}", description: "JSON array of top 5 movies" },
    { placeholder: "{{topShowsJson}}", description: "JSON array of top 5 shows" },
    { placeholder: "{{longestStreak}}", description: "Longest consecutive-day watch streak" },
    { placeholder: "{{peakHour}}", description: "Hour of day with the most plays" },
    { placeholder: "{{peakDayOfWeek}}", description: "Day of week with the most watch time" },
    { placeholder: "{{derivedStatsSection}}", description: "Viewing patterns section: streaks, peak hour, weekly rhythm (empty if not available)" },
    { placeholder: "{{percentileSection}}", description: "Server watch-time percentile section (empty if not available)" },
    { placeholder: "{{archetypeCandidates}}", description: "The curated archetype list the LLM chooses from" },
    { placeholder: "{{leaderboardSection}}", description: "Leaderboard statistics section (empty if not available)" },
    { placeholder: "{{serverStatsSection}}", description: "Server statistics section (empty if not available)" },
    { placeholder: "{{overseerrStatsSection}}", description: "Overseerr statistics section (empty if not available)" },
    { placeholder: "{{watchTimeByMonthSection}}", description: "Watch time by month section (empty if not available)" },
    { placeholder: "{{serverName}}", description: "Server name (empty if not available)" },
    { placeholder: "{{bingeWatcher}}", description: "'true' or 'false' based on viewing habits" },
    { placeholder: "{{discoveryScore}}", description: "Discovery score (0-100)" },
    { placeholder: "{{overseerrSectionJson}}", description: "DEPRECATED — resolves to empty (output format is now schema-enforced)" },
    { placeholder: "{{overseerrAnimationDelay}}", description: "DEPRECATED — resolves to empty (pacing is viewer-owned)" },
    { placeholder: "{{insightsAnimationDelay}}", description: "DEPRECATED — resolves to empty (pacing is viewer-owned)" },
    { placeholder: "{{funFactsAnimationDelay}}", description: "DEPRECATED — resolves to empty (pacing is viewer-owned)" },
    { placeholder: "{{serverStatsFacts}}", description: "DEPRECATED — resolves to empty (output format is now schema-enforced)" },
    { placeholder: "{{serverStatsContent}}", description: "DEPRECATED — resolves to empty (output format is now schema-enforced)" },
  ]
}
