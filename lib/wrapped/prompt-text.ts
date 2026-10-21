/**
 * The Wrapped v2 placeholder list, for the admin prompt editor (a client
 * component). The v2 prompt itself went with the v2 playground (P8.8).
 */

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
