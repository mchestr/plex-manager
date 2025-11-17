/**
 * LLM prompt template for generating Plex Wrapped content
 */

import { WrappedData, WrappedStatistics } from "@/types/wrapped"

/**
 * Format watch time in minutes to a human-readable string with explicit units
 */
function formatWatchTime(minutes: number): string {
  if (minutes === 0) return "0 minutes"

  const days = Math.floor(minutes / (60 * 24))
  const hours = Math.floor((minutes % (60 * 24)) / 60)
  const mins = minutes % 60

  const parts: string[] = []
  if (days > 0) {
    parts.push(`${days} ${days === 1 ? "day" : "days"}`)
  }
  if (hours > 0) {
    parts.push(`${hours} ${hours === 1 ? "hour" : "hours"}`)
  }
  if (mins > 0 || parts.length === 0) {
    parts.push(`${mins} ${mins === 1 ? "minute" : "minutes"}`)
  }

  return parts.join(", ")
}

/**
 * Format watch time for display in lists (shorter format but still explicit)
 */
function formatWatchTimeShort(minutes: number): string {
  if (minutes === 0) return "0 minutes"

  const days = Math.floor(minutes / (60 * 24))
  const hours = Math.floor((minutes % (60 * 24)) / 60)
  const mins = minutes % 60

  const parts: string[] = []
  if (days > 0) parts.push(`${days} ${days === 1 ? "day" : "days"}`)
  if (hours > 0) parts.push(`${hours} ${hours === 1 ? "hour" : "hours"}`)
  if (mins > 0 || parts.length === 0) parts.push(`${mins} ${mins === 1 ? "minute" : "minutes"}`)

  return parts.join(", ")
}

/**
 * Generate the prompt for LLM to create wrapped content
 */
export function generateWrappedPrompt(
  userName: string,
  year: number,
  statistics: WrappedStatistics
): string {
  const prompt = `You are creating a personalized "Plex Wrapped" experience for ${userName} for the year ${year}, similar to Spotify Wrapped.

Your task is to generate engaging, fun, and personalized content based on viewing statistics. Be creative, use emojis sparingly, and make it feel celebratory and personal.

=== STYLE GUIDELINES ===

1. PERSON: Always use 2nd person ("you", "your") - never 3rd person ("they", "their")

2. TONE: Fun, energetic, celebratory - use creative comparisons and metaphors

3. HIGHLIGHT TAGS: Wrap ALL numbers, times, and stats in <highlight>tags</highlight> for visual impact

4. WATCH TIME: Convert minutes to readable units (days, hours, minutes) - never show raw minutes

5. SERVER REFERENCES: Use server name only (e.g., "MikeFlix") - never say "Your Plex server" or "Your server"

=== VIEWING STATISTICS FOR ${year} ===

Here are the viewing statistics:

**Watch Time (all values are in minutes, converted to days/hours/minutes for clarity):**
- Total watch time: ${formatWatchTime(statistics.totalWatchTime.total)} (${statistics.totalWatchTime.total} minutes total)
- Movies watch time: ${formatWatchTime(statistics.totalWatchTime.movies)} (${statistics.totalWatchTime.movies} minutes total)
- Shows watch time: ${formatWatchTime(statistics.totalWatchTime.shows)} (${statistics.totalWatchTime.shows} minutes total)

**Content Watched:**
- Movies watched: ${statistics.moviesWatched}
- Shows watched: ${statistics.showsWatched}
- Episodes watched: ${statistics.episodesWatched}

**Top Movies (by watch time - all times in minutes):**
${statistics.topMovies.slice(0, 5).map((movie, idx) =>
  `${idx + 1}. ${movie.title}${movie.year ? ` (${movie.year})` : ""} - ${formatWatchTimeShort(movie.watchTime)} watched (${movie.watchTime} minutes)`
).join("\n")}

**Top Shows (by watch time - all times in minutes):**
${statistics.topShows.slice(0, 5).map((show, idx) =>
  `${idx + 1}. ${show.title}${show.year ? ` (${show.year})` : ""} - ${formatWatchTimeShort(show.watchTime)} watched (${show.watchTime} minutes), ${show.episodesWatched} episodes`
).join("\n")}

${statistics.leaderboards ? `
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
    ? `The top watcher watched ${formatWatchTimeShort(topWatcher.watchTime)} (${topWatcher.watchTime} minutes)`
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
    ? `The top watcher watched ${formatWatchTimeShort(topWatcher.watchTime)} (${topWatcher.watchTime} minutes, ${topWatcher.episodesWatched} episodes)`
    : ""
  return `- ${show.title}: Your position: ${positionText}. ${topWatcherText}`
}).join("\n")}
` : ""}

${statistics.serverStats ? `
**Plex Server Statistics:**
- Server name: ${statistics.serverStats.serverName}
- Total storage: ${statistics.serverStats.totalStorageFormatted}
- Library size:
  - Movies: ${statistics.serverStats.librarySize.movies.toLocaleString()}
  - Shows: ${statistics.serverStats.librarySize.shows.toLocaleString()}
  - Episodes: ${statistics.serverStats.librarySize.episodes.toLocaleString()}
` : ""}

${statistics.overseerrStats ? `
**Overseerr Requests:**
- Your requests: ${statistics.overseerrStats.totalRequests}
- Total server requests: ${statistics.overseerrStats.totalServerRequests}
- Approved: ${statistics.overseerrStats.approvedRequests}
- Pending: ${statistics.overseerrStats.pendingRequests}
- Top genres: ${statistics.overseerrStats.topRequestedGenres.map(g => g.genre).join(", ")}
` : ""}

${statistics.watchTimeByMonth && statistics.watchTimeByMonth.length > 0 ? `
**Watch Time by Month (all times in minutes):**
${statistics.watchTimeByMonth.map(month => {
  const watchTimeText = `${formatWatchTimeShort(month.watchTime)} (${month.watchTime} minutes)`
  const movieText = month.topMovie
    ? ` | Top Movie: ${month.topMovie.title}${month.topMovie.year ? ` (${month.topMovie.year})` : ""} - ${formatWatchTimeShort(month.topMovie.watchTime)} (${month.topMovie.watchTime} minutes)`
    : ""
  const showText = month.topShow
    ? ` | Top Show: ${month.topShow.title}${month.topShow.year ? ` (${month.topShow.year})` : ""} - ${formatWatchTimeShort(month.topShow.watchTime)} (${month.topShow.watchTime} minutes), ${month.topShow.episodesWatched} episodes`
    : ""
  return `- ${month.monthName}: ${watchTimeText}${movieText}${showText}`
}).join("\n")}
` : ""}

=== SECTION REQUIREMENTS ===

HERO SECTION:
- Content: 2-3 exciting sentences with bold statements or engaging questions
- Style: Energetic, celebratory, use creative comparisons/metaphors
- Highlight tags: Wrap ALL numbers and stats (use 3-5+ highlights)
- Prominent Stat: REQUIRED in data object:
  * "value": Most impressive number (watch time in days, movies watched, etc.)
  * "label": Short label ("days", "movies", "hours", "episodes")
  * "description": Brief context ("Total viewing time", "Movies completed", etc.)
- Example: "Ready to see how <highlight>45</highlight> movies shaped your year? You embarked on an epic journey through <highlight>67 days</highlight> of entertainment!" (Use YOUR actual stats!)

ANIMATION DELAY RULES:
- Hero section: Always use "animationDelay": 0 (appears first)
- Other sections: Calculate delays based on content length to pace the reading experience
- Simple formula: Estimate reading time (words ÷ 200 × 60 × 1000ms) × 1.5, then add to previous section's delay
- Minimum delay between sections: 2000ms (2 seconds)
- For list sections (top-movies, top-shows, fun-facts): Add extra 2000-3000ms for scanning
- Example: ~50 words = ~22,500ms, ~100 words = ~45,000ms

FUN-FACTS SECTION:
- MUST be the last section
- Combine viewing habit facts with server library info (if available)
- Reference server by name only (e.g., "MikeFlix"), NOT "Your Plex server"

=== OUTPUT FORMAT ===

Generate a JSON response with the following structure. Make it fun, engaging, and personalized:

**IMPORTANT: The JSON structure below shows the REQUIRED FORMAT. DO NOT copy example values - use YOUR actual statistics!**

**Key Requirements:**
- Hero section first (animationDelay: 0), fun-facts section last
- Include only relevant sections (e.g., overseerr-stats only if overseerrStats data exists)
- Use actual movie/show objects from statistics in data.movies and data.shows arrays
- Calculate bingeWatcher: true if any show has episodesWatched > 20, else false
- Calculate discoveryScore: min(100, max(0, floor((moviesWatched + showsWatched) / 10)))
- Calculate animation delays based on content length (not the example values shown)

{
  "sections": [
    {
      "id": "hero",
      "type": "hero",
      "title": "Your ${year} Plex Year",
      "subtitle": "A personalized look at your viewing habits",
      "content": "[EXAMPLE - REPLACE WITH REAL CONTENT] Your 2-3 exciting, high-impact sentences with highlights go here. Make them energetic and celebratory!",
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
      "content": "[EXAMPLE - REPLACE WITH REAL CONTENT] A fun, engaging description of your total watch time with exciting comparisons (e.g., 'That's like watching <highlight>X</highlight> movies back to back!' or 'You could have flown to the moon <highlight>X</highlight> times!'). Be playful and celebratory! Always include explicit units (days, hours, minutes) when mentioning watch times. Use <highlight>tags</highlight> around ALL numbers to make them visually pop!",
      "animationDelay": 2000
    },
    {
      "id": "movies-breakdown",
      "type": "movies-breakdown",
      "title": "Movie Marathon",
      "subtitle": "Your movie viewing stats",
      "content": "[EXAMPLE - REPLACE WITH REAL CONTENT] A fun, playful message about your movie watching habits. Celebrate your cinematic journey! Use <highlight>tags</highlight> around all numbers and stats to make them visually pop!",
      "animationDelay": 4000
    },
    {
      "id": "shows-breakdown",
      "type": "shows-breakdown",
      "title": "Binge Watcher",
      "subtitle": "Your show viewing stats",
      "content": "[EXAMPLE - REPLACE WITH REAL CONTENT] A fun, playful message about your show watching habits. Celebrate your binge-watching achievements! Use <highlight>tags</highlight> around all numbers and stats to make them visually pop!",
      "animationDelay": 6000
    },
    {
      "id": "top-movies",
      "type": "top-movies",
      "title": "Your Top Movies",
      "subtitle": "The films you couldn't stop watching",
      "content": "[EXAMPLE - REPLACE WITH REAL CONTENT] A fun, energetic description of your top movies with playful insights. Make it exciting! Use <highlight>tags</highlight> around all numbers to make them visually pop!",
      "data": {
        "movies": ${JSON.stringify(statistics.topMovies.slice(0, 5))}
      },
      "animationDelay": 8000
    },
    {
      "id": "top-shows",
      "type": "top-shows",
      "title": "Your Top Shows",
      "subtitle": "The series that kept you coming back",
      "content": "[EXAMPLE - REPLACE WITH REAL CONTENT] A fun, energetic description of your top shows with playful insights. Celebrate your binge-watching! Use <highlight>tags</highlight> around all numbers to make them visually pop!",
      "data": {
        "shows": ${JSON.stringify(statistics.topShows.slice(0, 5))}
      },
      "animationDelay": 10000
    }${statistics.overseerrStats ? `,
    {
      "id": "overseerr-stats",
      "type": "overseerr-stats",
      "title": "Your Requests",
      "subtitle": "Building your perfect library",
      "content": "[EXAMPLE - REPLACE WITH REAL CONTENT] A fun, playful message about your Overseerr request habits. Celebrate your contribution to building the library! Use <highlight>tags</highlight> around all numbers to make them visually pop!",
      "animationDelay": ${statistics.serverStats ? 12000 : 10000}
    }` : ""},
    {
      "id": "insights",
      "type": "insights",
      "title": "Your Viewing Personality",
      "subtitle": "What your stats say about you",
      "content": "[EXAMPLE - REPLACE WITH REAL CONTENT] A fun, personalized insight paragraph (3-4 sentences) about your viewing personality. Be playful and celebratory! Use <highlight>tags</highlight> around all numbers to make them visually pop!",
      "animationDelay": ${statistics.overseerrStats ? 14000 : statistics.serverStats ? 12000 : 10000}
    },
    {
      "id": "fun-facts",
      "type": "fun-facts",
      "title": "Fun Facts & Server Stats",
      "subtitle": "Did you know?",
      "content": "[EXAMPLE - REPLACE WITH REAL CONTENT] ${statistics.serverStats ? `A fun, engaging introductory message combining interesting facts about your viewing habits with information about ${statistics.serverStats.serverName}. IMPORTANT: Reference the server by name only (e.g., '${statistics.serverStats.serverName}'), NOT as 'Your Plex server' or 'Your server' - the user does not own the server. Use phrases like '${statistics.serverStats.serverName} is a treasure trove with...' or '${statistics.serverStats.serverName} has enough content to watch for <highlight>X</highlight> years!'` : "A fun, engaging introductory message about interesting facts from your viewing habits."} Make it exciting and playful! Use <highlight>tags</highlight> around all numbers to make them visually pop!",
      "data": {
        "facts": [
          "[EXAMPLE - REPLACE] Fun fact about your viewing habits (use <highlight>tags</highlight> around numbers)",
          "[EXAMPLE - REPLACE] Another fun fact about your viewing habits (use <highlight>tags</highlight> around numbers)",
          "[EXAMPLE - REPLACE] One more fun fact about your viewing habits (use <highlight>tags</highlight> around numbers)"${statistics.serverStats ? `,
          "[EXAMPLE - REPLACE] Fun fact about ${statistics.serverStats.serverName}'s library size - mention the <highlight>${statistics.serverStats.librarySize.movies.toLocaleString()}</highlight> movies available (use <highlight>tags</highlight> around numbers)",
          "[EXAMPLE - REPLACE] Fun fact about ${statistics.serverStats.serverName}'s storage - mention the <highlight>${statistics.serverStats.totalStorageFormatted}</highlight> total storage (use <highlight>tags</highlight> around numbers)"` : ""}
        ]
      },
      "animationDelay": ${statistics.overseerrStats ? 16000 : statistics.serverStats ? 14000 : 12000}
    }
  ],
  "insights": {
    "personality": "[EXAMPLE - REPLACE] A short personality description (e.g., 'Cinephile', 'Binge Watcher', 'Genre Explorer')",
    "topGenre": "[EXAMPLE - REPLACE] Your most watched genre",
    "bingeWatcher": ${statistics.topShows.some(s => s.episodesWatched > 20) ? "true" : "false"},
    "discoveryScore": ${Math.min(100, Math.max(0, Math.floor((statistics.moviesWatched + statistics.showsWatched) / 10)))},
    "funFacts": [
      "[EXAMPLE - REPLACE] Fun fact 1 about your viewing (use <highlight>tags</highlight> around numbers)",
      "[EXAMPLE - REPLACE] Fun fact 2 about your viewing (use <highlight>tags</highlight> around numbers)",
      "[EXAMPLE - REPLACE] Fun fact 3 about your viewing (use <highlight>tags</highlight> around numbers)"
    ]
  },
  "summary": "[EXAMPLE - REPLACE] A concise, shareable summary (2-3 sentences) highlighting the most impressive or interesting stats from your year. This will be used for social sharing, so make it engaging, fun, and celebratory! Include key numbers like total watch time, top movie/show, or interesting comparisons. Use <highlight>tags</highlight> around all numbers! IMPORTANT: Use YOUR actual statistics from the data above, not example values. Reference the actual top movie title, actual watch time, and actual show count from the statistics provided."
}

=== OUTPUT REQUIREMENTS ===

**CRITICAL:**
- Use REAL statistics from the data above - NOT example values
- Write personalized content - NOT placeholder text like "[EXAMPLE - REPLACE]"
- Calculate animation delays based on content length - NOT example delays (2000, 4000, etc.)
- Include actual movie/show objects in data arrays - NOT empty arrays
- Return ONLY valid JSON - no markdown, no comments, no explanatory text
`

  return prompt
}

/**
 * Parse LLM response and validate structure
 */
export function parseWrappedResponse(
  llmResponse: string,
  statistics: WrappedStatistics,
  year: number,
  userId: string,
  userName: string
): WrappedData {
  try {
    // Clean the response - remove markdown code blocks if present
    let cleaned = llmResponse.trim()
    if (cleaned.startsWith("```json")) {
      cleaned = cleaned.replace(/^```json\n?/, "").replace(/\n?```$/, "")
    } else if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```\n?/, "").replace(/\n?```$/, "")
    }

    // Validate JSON structure before parsing
    if (!cleaned.startsWith("{") || !cleaned.endsWith("}")) {
      throw new Error("Response does not contain valid JSON structure")
    }

    const parsed = JSON.parse(cleaned)

    // Validate that response doesn't contain example/placeholder values
    const examplePlaceholders = [
      "[EXAMPLE - REPLACE]",
      "[EXAMPLE - REPLACE WITH REAL CONTENT]",
      "Your 2-3 exciting, high-impact sentences",
      "A fun, engaging description",
      "A fun, playful message",
      "A fun, energetic description",
      "A fun, personalized insight paragraph",
      "A concise, shareable summary",
      "Fun fact about your viewing habits",
      "Another fun fact about your viewing habits",
      "One more fun fact about your viewing habits",
      "Fun fact 1 about your viewing",
      "Fun fact 2 about your viewing",
      "Fun fact 3 about your viewing",
    ]

    // Check for example placeholder text in content fields
    const responseString = JSON.stringify(parsed).toLowerCase()
    for (const placeholder of examplePlaceholders) {
      if (responseString.includes(placeholder.toLowerCase())) {
        throw new Error(
          `Response contains example placeholder text: "${placeholder}". The LLM must generate personalized content, not copy example values.`
        )
      }
    }

    // Check for example prominentStat value (67 days)
    if (parsed.sections) {
      for (const section of parsed.sections) {
        if (section.data?.prominentStat?.value === 67 && section.data?.prominentStat?.label === "days") {
          throw new Error(
            "Response contains example prominentStat value (67 days). The LLM must use actual statistics from the provided data."
          )
        }
      }
    }

    // Check for example animation delays (common example values)
    const exampleDelays = [2000, 4000, 6000, 8000, 10000, 12000, 14000, 16000]
    if (parsed.sections) {
      const delays = parsed.sections
        .map((s: any) => s.animationDelay)
        .filter((d: any) => d !== undefined && d !== 0)
      // If all delays match example values exactly, it's suspicious
      if (delays.length > 0 && delays.every((d: number) => exampleDelays.includes(d))) {
        // Allow if there are many sections (might be coincidence), but warn if few sections
        if (parsed.sections.length <= 5) {
          console.warn(
            "[PROMPT] Warning: Animation delays match example values exactly. This may indicate copied example data."
          )
        }
      }

      // Validate that top-movies and top-shows sections have actual data
      for (const section of parsed.sections) {
        if (section.type === "top-movies" && (!section.data?.movies || !Array.isArray(section.data.movies) || section.data.movies.length === 0)) {
          throw new Error(
            "top-movies section must include actual movie data from statistics. The movies array cannot be empty."
          )
        }
        if (section.type === "top-shows" && (!section.data?.shows || !Array.isArray(section.data.shows) || section.data.shows.length === 0)) {
          throw new Error(
            "top-shows section must include actual show data from statistics. The shows array cannot be empty."
          )
        }
      }
    }

    return {
      year,
      userId,
      userName,
      generatedAt: new Date().toISOString(),
      statistics,
      sections: parsed.sections || [],
      insights: parsed.insights || {
        personality: "Viewer",
        topGenre: "Various",
        bingeWatcher: false,
        discoveryScore: 50,
        funFacts: [],
      },
      summary: parsed.summary || undefined,
      metadata: {
        totalSections: parsed.sections?.length || 0,
        generationTime: 0,
      },
    }
  } catch (error) {
    console.error("[PROMPT] Error parsing LLM response:", error)
    // Return a fallback structure
    return {
      year,
      userId,
      userName,
      generatedAt: new Date().toISOString(),
      statistics,
      sections: [],
      insights: {
        personality: "Viewer",
        topGenre: "Various",
        bingeWatcher: false,
        discoveryScore: 50,
        funFacts: [],
      },
      summary: undefined,
      metadata: {
        totalSections: 0,
        generationTime: 0,
      },
    }
  }
}

