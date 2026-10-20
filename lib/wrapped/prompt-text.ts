/**
 * The Wrapped v2 prompt texts: the system prompt, the default user template
 * and the placeholder list. Plain text with no server imports, so the admin
 * prompt editor and playground (client components) can show them;
 * `lib/wrapped/prompt-template.ts` renders them on the server.
 */

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

**archetype** — The candidate list is a data-ranked shortlist: each entry includes the statistical evidence that earned its place, best fit first. Choose the candidate whose motif and evidence tell the strongest story — default to the first unless a later candidate's evidence is clearly more distinctive for this viewer. Set "id" to its exact id. Write:
- "tagline": one marquee-worthy line that captures why this is them (no more than ~10 words).
- "dedication": 2-3 full sentences in the style of an award citation, grounded in their actual numbers (cite at least one specific stat inside <highlight>tags</highlight>). This is the emotional peak of the experience — make it land. It must say more than the tagline does.

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

**Archetype Candidates (choose exactly one id):**
{{archetypeCandidates}}

Generate the personalized Plex Wrapped content based on these statistics.`
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
    { placeholder: "{{archetypeCandidates}}", description: "Data-ranked archetype shortlist (best fit first, with evidence) the LLM chooses from" },
    { placeholder: "{{leaderboardSection}}", description: "Leaderboard statistics section (empty if not available)" },
    { placeholder: "{{serverStatsSection}}", description: "Server statistics section (empty if not available)" },
    { placeholder: "{{overseerrStatsSection}}", description: "Overseerr statistics section (empty if not available)" },
    { placeholder: "{{watchTimeByMonthSection}}", description: "Watch time by month section (empty if not available)" },
    { placeholder: "{{serverName}}", description: "Server name (empty if not available)" },
    { placeholder: "{{bingeWatcher}}", description: "DEPRECATED — resolves to empty (no longer an LLM output)" },
    { placeholder: "{{discoveryScore}}", description: "DEPRECATED — resolves to empty (no longer an LLM output)" },
    { placeholder: "{{overseerrSectionJson}}", description: "DEPRECATED — resolves to empty (output format is now schema-enforced)" },
    { placeholder: "{{overseerrAnimationDelay}}", description: "DEPRECATED — resolves to empty (pacing is viewer-owned)" },
    { placeholder: "{{insightsAnimationDelay}}", description: "DEPRECATED — resolves to empty (pacing is viewer-owned)" },
    { placeholder: "{{funFactsAnimationDelay}}", description: "DEPRECATED — resolves to empty (pacing is viewer-owned)" },
    { placeholder: "{{serverStatsFacts}}", description: "DEPRECATED — resolves to empty (output format is now schema-enforced)" },
    { placeholder: "{{serverStatsContent}}", description: "DEPRECATED — resolves to empty (output format is now schema-enforced)" },
  ]
}
