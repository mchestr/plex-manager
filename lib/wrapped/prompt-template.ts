/**
 * Prompt template system with placeholder replacement
 */

import { getActivePromptTemplate } from "@/actions/prompts"
import { formatWatchTime } from "@/lib/utils/time-formatting"
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

    // Overseerr section JSON (for JSON output format)
    "{{overseerrSectionJson}}": statistics.overseerrStats ? `,
    {
      "id": "overseerr-stats",
      "type": "overseerr-stats",
      "title": "Your Requests",
      "subtitle": "Building your perfect library",
      "content": "[EXAMPLE - REPLACE WITH REAL CONTENT] A fun, playful message about your Overseerr request habits. Celebrate your contribution to building the library! Use <highlight>tags</highlight> around all numbers to make them visually pop!",
      "animationDelay": ${statistics.serverStats ? 12000 : 10000}
    }` : "",

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

    // Animation delay calculations (for conditional sections)
    "{{overseerrAnimationDelay}}": statistics.overseerrStats ? (statistics.serverStats ? "12000" : "10000") : "",
    "{{insightsAnimationDelay}}": statistics.overseerrStats ? "14000" : (statistics.serverStats ? "12000" : "10000"),
    "{{funFactsAnimationDelay}}": statistics.overseerrStats ? "16000" : (statistics.serverStats ? "14000" : "12000"),

    // Server stats facts (for fun-facts section)
    "{{serverStatsFacts}}": statistics.serverStats ? `,
          "[EXAMPLE - REPLACE] Fun fact about {{serverName}}'s library size - mention the <highlight>${statistics.serverStats.librarySize.movies.toLocaleString()}</highlight> movies available (use <highlight>tags</highlight> around numbers)",
          "[EXAMPLE - REPLACE] Fun fact about {{serverName}}'s storage - mention the <highlight>${statistics.serverStats.totalStorageFormatted}</highlight> total storage (use <highlight>tags</highlight> around numbers)"` : "",

    // Server stats content (for fun-facts section)
    "{{serverStatsContent}}": statistics.serverStats ? `A fun, engaging introductory message combining interesting facts about your viewing habits with information about {{serverName}}. IMPORTANT: Reference the server by name only (e.g., '{{serverName}}'), NOT as 'Your Plex server' or 'Your server' - the user does not own the server. Use phrases like '{{serverName}} is a treasure trove with...' or '{{serverName}} has enough content to watch for <highlight>X</highlight> years!'` : "A fun, engaging introductory message about interesting facts from your viewing habits.",
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
 * Generate the system prompt with instructions, guidelines, and output format requirements
 * This should contain all static instructions that don't change per user
 */
export function generateSystemPrompt(): string {
  return `You are a creative assistant that generates personalized, fun, and engaging content for Plex Wrapped experiences, similar to Spotify Wrapped.

Your task is to generate engaging, fun, and personalized content based on viewing statistics. Be creative, use emojis sparingly, and make it feel celebratory and personal.

=== STYLE GUIDELINES ===

1. PERSON: Always use 2nd person ("you", "your") - never 3rd person ("they", "their")

2. TONE: Fun, energetic, celebratory - use creative comparisons and metaphors

3. HIGHLIGHT TAGS: Wrap ALL numbers, times, and stats in <highlight>tags</highlight> for visual impact

4. WATCH TIME: Convert minutes to readable units (days, hours, minutes) - never show raw minutes

5. SERVER REFERENCES: Use server name only (e.g., the server name provided) - never say "Your Plex server" or "Your server"

=== SECTION REQUIREMENTS ===

HERO SECTION:
- Content: 2-3 exciting sentences with bold statements or engaging questions
- Style: Energetic, celebratory, use creative comparisons/metaphors
- Highlight tags: Wrap ALL numbers and stats (use 3-5+ highlights)
- Prominent Stat: REQUIRED in data object:
  * "value": Most impressive number (watch time in days, movies watched, etc.)
  * "label": Short label ("days", "movies", "hours", "episodes")
  * "description": Brief context ("Total viewing time", "Movies completed", etc.)

ANIMATION DELAY RULES:
- Hero section: Always use "animationDelay": 0 (appears first)
- Other sections: Calculate delays based on content length to pace the reading experience
- Simple formula: Estimate reading time (words ÷ 200 × 60 × 1000ms) × 1.5, then add to previous section's delay
- Minimum delay between sections: 2000ms (2 seconds)
- For list sections (top-movies, top-shows, fun-facts): Add extra 2000-3000ms for scanning

FUN-FACTS SECTION:
- MUST be the last section
- Combine viewing habit facts with server library info (if available)
- Reference server by name only, NOT "Your Plex server"

=== OUTPUT FORMAT ===

Generate a JSON response with the following structure. Make it fun, engaging, and personalized:

**IMPORTANT: The JSON structure below shows the REQUIRED FORMAT. DO NOT copy example values - use YOUR actual statistics!**

**Key Requirements:**
- Hero section first (animationDelay: 0), fun-facts section last
- Include only relevant sections (e.g., overseerr-stats only if overseerrStats data exists)
- Use actual movie/show objects from statistics in data.movies and data.shows arrays
- Calculate bingeWatcher: true if any show has episodesWatched > 20, else false
- Calculate discoveryScore: min(100, max(0, floor((moviesWatched + showsWatched) / 10)))
- Calculate animation delays based on content length (not example values)

**TOP MOVIES/TV SHOWS FORMATTING:**
- For "top-movies" section, the "data.movies" array must contain objects with:
  * "title" (string, required): The movie title exactly as provided in statistics
  * "year" (number, optional): Release year if available
  * "watchTime" (number, required): Watch time in MINUTES (use the exact value from statistics.topMovies)
  * Optional fields: "playCount", "rating", "ratingKey" (include if available in statistics)

- For "top-shows" section, the "data.shows" array must contain objects with:
  * "title" (string, required): The show title exactly as provided in statistics
  * "year" (number, optional): Release year if available
  * "watchTime" (number, required): Watch time in MINUTES (use the exact value from statistics.topShows)
  * "episodesWatched" (number, required): Number of episodes watched (use the exact value from statistics.topShows)
  * Optional fields: "playCount", "rating", "ratingKey" (include if available in statistics)

- IMPORTANT: Use the EXACT objects from statistics.topMovies and statistics.topShows arrays - do not modify titles, watch times, or episode counts. Include all top 5 items (or fewer if less than 5 available).

**FUN FACTS FORMATTING:**
- For "fun-facts" section, the "data.facts" array must contain an array of strings (string[])
- Each fact should be:
  * A single, complete sentence (or short phrase) that's fun and engaging
  * Written in 2nd person ("you", "your") - never 3rd person
  * Use <highlight>tags</highlight> around ALL numbers, times, and stats for visual impact
  * Be celebratory and playful - make it feel like a fun discovery
  * Include 3-7 facts total (more if serverStats are available)
  * Mix viewing habit facts (movies watched, watch time, top content) with server library facts (if serverStats available)
  * When referencing server stats, use the server name only (e.g., "{{serverName}} has <highlight>10,000</highlight> movies") - never say "Your Plex server"
  * Convert watch times to readable units (days, hours, minutes) - never show raw minutes
  * Examples:
    - "You watched <highlight>150</highlight> movies and <highlight>25</highlight> shows this year!"
    - "Your total watch time was <highlight>67 days, 3 hours</highlight> - that's more than 2 months!"
    - "Your most watched movie was <highlight>The Matrix</highlight> with <highlight>5</highlight> viewings"
    - "{{serverName}} has <highlight>10,000</highlight> movies in its library - and you've watched <highlight>150</highlight> of them!"

**INSIGHTS.FUNFACTS FORMATTING:**
- The "insights.funFacts" array must contain an array of strings (string[])
- Each fact should follow the same formatting rules as "data.facts" in the fun-facts section:
  * A single, complete sentence (or short phrase) that's fun and engaging
  * Written in 2nd person ("you", "your") - never 3rd person
  * Use <highlight>tags</highlight> around ALL numbers, times, and stats for visual impact
  * Be celebratory and playful - make it feel like a fun discovery
  * Include 2-5 facts total (shorter than the fun-facts section)
  * Focus on viewing habit facts (movies watched, watch time, top content)
  * Convert watch times to readable units (days, hours, minutes) - never show raw minutes
  * Examples:
    - "You watched <highlight>150</highlight> movies and <highlight>25</highlight> shows this year!"
    - "Your total watch time was <highlight>67 days, 3 hours</highlight> - that's more than 2 months!"
    - "Your most watched movie was <highlight>The Matrix</highlight> with <highlight>5</highlight> viewings"

{
  "sections": [
    {
      "id": "hero",
      "type": "hero",
      "title": "Your [YEAR] Plex Year",
      "subtitle": "A personalized look at your viewing habits",
      "content": "Your 2-3 exciting, high-impact sentences with highlights go here. Make them energetic and celebratory!",
      "data": {
        "prominentStat": {
          "value": 67,
          "label": "days",
          "description": "Total viewing time"
        }
      },
      "animationDelay": 0
    },
    {
      "id": "total-watch-time",
      "type": "total-watch-time",
      "title": "You watched...",
      "subtitle": "Total viewing time",
      "content": "A fun, engaging description of your total watch time with exciting comparisons. Be playful and celebratory! Always include explicit units (days, hours, minutes) when mentioning watch times. Use <highlight>tags</highlight> around ALL numbers!",
      "animationDelay": 2000
    },
    {
      "id": "movies-breakdown",
      "type": "movies-breakdown",
      "title": "Movie Marathon",
      "subtitle": "Your movie viewing stats",
      "content": "A fun, playful message about your movie watching habits. Celebrate your cinematic journey! Use <highlight>tags</highlight> around all numbers!",
      "animationDelay": 4000
    },
    {
      "id": "shows-breakdown",
      "type": "shows-breakdown",
      "title": "Binge Watcher",
      "subtitle": "Your show viewing stats",
      "content": "A fun, playful message about your show watching habits. Celebrate your binge-watching achievements! Use <highlight>tags</highlight> around all numbers!",
      "animationDelay": 6000
    },
    {
      "id": "top-movies",
      "type": "top-movies",
      "title": "Your Top Movies",
      "subtitle": "The films you couldn't stop watching",
      "content": "A fun, energetic description of your top movies with playful insights. Make it exciting! Use <highlight>tags</highlight> around all numbers!",
      "data": {
        "movies": [
          {
            "title": "Movie Title",
            "year": 2023,
            "watchTime": 180
          }
        ]
      },
      "animationDelay": 8000
    },
    {
      "id": "top-shows",
      "type": "top-shows",
      "title": "Your Top Shows",
      "subtitle": "The series that kept you coming back",
      "content": "A fun, energetic description of your top shows with playful insights. Celebrate your binge-watching! Use <highlight>tags</highlight> around all numbers!",
      "data": {
        "shows": [
          {
            "title": "Show Title",
            "year": 2023,
            "watchTime": 1200,
            "episodesWatched": 10
          }
        ]
      },
      "animationDelay": 10000
    },
    {
      "id": "insights",
      "type": "insights",
      "title": "Your Viewing Personality",
      "subtitle": "What your stats say about you",
      "content": "A fun, personalized insight paragraph (3-4 sentences) about your viewing personality. Be playful and celebratory! Use <highlight>tags</highlight> around all numbers!",
      "animationDelay": 12000
    },
    {
      "id": "fun-facts",
      "type": "fun-facts",
      "title": "Fun Facts & Server Stats",
      "subtitle": "Did you know?",
      "content": "A fun, engaging introductory message about interesting facts from your viewing habits. Make it exciting and playful! Use <highlight>tags</highlight> around all numbers!",
      "data": {
        "facts": [
          "You watched <highlight>150</highlight> movies this year!",
          "Your total watch time was <highlight>67 days</highlight> - that's more than 2 months!",
          "Your most watched movie was <highlight>The Matrix</highlight> with <highlight>5</highlight> viewings"
        ]
      },
      "animationDelay": 14000
    }
  ],
  "insights": {
    "personality": "A short personality description",
    "topGenre": "Your most watched genre",
    "bingeWatcher": false,
    "discoveryScore": 0,
    "funFacts": [
      "You watched <highlight>150</highlight> movies this year!",
      "Your total watch time was <highlight>67 days</highlight>!"
    ]
  },
  "summary": "A concise, shareable summary (2-3 sentences) highlighting the most impressive or interesting stats from your year. This will be used for social sharing, so make it engaging, fun, and celebratory! Include key numbers like total watch time, top movie/show, or interesting comparisons. Use <highlight>tags</highlight> around all numbers!"
}

=== OUTPUT REQUIREMENTS ===

**CRITICAL:**
- Use REAL statistics from the data provided - NOT example values
- Write personalized content - NOT placeholder text
- Calculate animation delays based on content length - NOT example delays
- Include actual movie/show objects in data arrays - NOT empty arrays
- Return ONLY valid JSON - no markdown, no comments, no explanatory text
- Always respond with valid JSON only`
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

{{leaderboardSection}}

{{serverStatsSection}}

{{overseerrStatsSection}}

{{watchTimeByMonthSection}}

**Additional Context:**
- Server name: {{serverName}}
- Binge watcher calculation: {{bingeWatcher}} (true if any show has episodesWatched > 20)
- Discovery score: {{discoveryScore}} (calculated as min(100, max(0, floor((moviesWatched + showsWatched) / 10))))

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
    { placeholder: "{{leaderboardSection}}", description: "Leaderboard statistics section (empty if not available)" },
    { placeholder: "{{serverStatsSection}}", description: "Server statistics section (empty if not available)" },
    { placeholder: "{{overseerrStatsSection}}", description: "Overseerr statistics section (empty if not available)" },
    { placeholder: "{{watchTimeByMonthSection}}", description: "Watch time by month section (empty if not available)" },
    { placeholder: "{{serverName}}", description: "Server name (empty if not available)" },
    { placeholder: "{{bingeWatcher}}", description: "'true' or 'false' based on viewing habits" },
    { placeholder: "{{discoveryScore}}", description: "Discovery score (0-100)" },
  ]
}

