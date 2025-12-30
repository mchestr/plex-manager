"use client"

import {
  createPromptTemplate,
  PromptTemplateInput,
  updatePromptTemplate,
} from "@/actions/prompts"
import { getAvailablePlaceholders } from "@/lib/wrapped/prompt-template"
import { formatWatchTime } from "@/lib/utils/time-formatting"
import { WrappedData, WrappedStatistics } from "@/types/wrapped"
import { PlexWrapped, PromptTemplate } from "@/lib/generated/prisma/client"
import { useRouter } from "next/navigation"
import { useMemo, useState, useTransition } from "react"
import { Button } from "@/components/ui/button"

interface PromptTemplateEditorProps {
  template?: PromptTemplate
  userWrapped?: PlexWrapped | null
  userName?: string
}

export function PromptTemplateEditor({ template, userWrapped, userName = "User" }: PromptTemplateEditorProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [showPlaceholderModal, setShowPlaceholderModal] = useState(false)
  const [placeholderSearch, setPlaceholderSearch] = useState("")
  const [formData, setFormData] = useState<PromptTemplateInput>({
    name: template?.name || "",
    description: template?.description || "",
    template: template?.template || "",
    isActive: template?.isActive || false,
  })

  // Undo/Redo history
  const [history, setHistory] = useState<string[]>([template?.template || ""])
  const [historyIndex, setHistoryIndex] = useState(0)
  const [isUndoRedo, setIsUndoRedo] = useState(false)

  const placeholders = getAvailablePlaceholders()

  // Default placeholders for quick access
  const defaultQuickPlaceholders = useMemo(() => [
    "{{userName}}",
    "{{year}}",
    "{{totalWatchTime}}",
    "{{moviesWatched}}",
    "{{showsWatched}}",
    "{{topMoviesList}}",
    "{{topShowsList}}",
    "{{serverName}}",
  ], [])

  // Get recently selected placeholder from localStorage
  const [recentPlaceholder, setRecentPlaceholder] = useState<string | null>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("prompt-template-recent-placeholder")
    }
    return null
  })

  // Build quick access list with recent placeholder first, then defaults
  const quickPlaceholders = useMemo(() => {
    const list: string[] = []

    // Add recent placeholder first if it exists and is valid
    if (recentPlaceholder && placeholders.some(p => p.placeholder === recentPlaceholder)) {
      list.push(recentPlaceholder)
    }

    // Add defaults, excluding the recent one if it's already added
    defaultQuickPlaceholders.forEach(placeholder => {
      if (placeholder !== recentPlaceholder) {
        list.push(placeholder)
      }
    })

    // Limit to 8 total (1 recent + 7 defaults)
    return list.slice(0, 8)
  }, [recentPlaceholder, defaultQuickPlaceholders, placeholders])

  // Group placeholders by category
  const placeholderGroups = useMemo(() => {
    const groups: Record<string, Array<{ placeholder: string; description: string }>> = {
      "Basic": [],
      "Watch Time": [],
      "Content Counts": [],
      "Top Content": [],
      "Sections": [],
      "Calculated": [],
    }

    placeholders.forEach(({ placeholder, description }) => {
      if (placeholder.includes("userName") || placeholder.includes("year")) {
        groups["Basic"].push({ placeholder, description })
      } else if (placeholder.includes("WatchTime") || placeholder.includes("watchTime")) {
        groups["Watch Time"].push({ placeholder, description })
      } else if (placeholder.includes("Watched") || placeholder.includes("episodes")) {
        groups["Content Counts"].push({ placeholder, description })
      } else if (placeholder.includes("topMovies") || placeholder.includes("topShows")) {
        groups["Top Content"].push({ placeholder, description })
      } else if (placeholder.includes("Section") || placeholder.includes("Json")) {
        groups["Sections"].push({ placeholder, description })
      } else {
        groups["Calculated"].push({ placeholder, description })
      }
    })

    return groups
  }, [placeholders])

  // Filter placeholders based on search
  const filteredPlaceholders = useMemo(() => {
    if (!placeholderSearch.trim()) return placeholders
    const searchLower = placeholderSearch.toLowerCase()
    return placeholders.filter(
      ({ placeholder, description }) =>
        placeholder.toLowerCase().includes(searchLower) ||
        description.toLowerCase().includes(searchLower)
    )
  }, [placeholders, placeholderSearch])

  // Parse wrapped data and extract statistics for examples
  const exampleStatistics = useMemo((): WrappedStatistics | null => {
    if (!userWrapped || userWrapped.status !== "completed" || !userWrapped.data) {
      // Generate default example statistics with all placeholder data

      return {
        totalWatchTime: {
          total: 96720, // ~67 days
          movies: 43200, // ~30 days
          shows: 53520, // ~37 days
        },
        moviesWatched: 45,
        showsWatched: 12,
        episodesWatched: 234,
        topMovies: [
          { title: "The Matrix", watchTime: 8160, playCount: 3, year: 1999, rating: 8.7 },
          { title: "Inception", watchTime: 8880, playCount: 2, year: 2010, rating: 8.8 },
          { title: "Interstellar", watchTime: 10200, playCount: 2, year: 2014, rating: 8.6 },
          { title: "The Dark Knight", watchTime: 9120, playCount: 2, year: 2008, rating: 9.0 },
          { title: "Pulp Fiction", watchTime: 9240, playCount: 1, year: 1994, rating: 8.9 },
        ],
        topShows: [
          { title: "Breaking Bad", watchTime: 12000, playCount: 1, episodesWatched: 62, year: 2008, rating: 9.5 },
          { title: "The Office", watchTime: 9600, playCount: 1, episodesWatched: 201, year: 2005, rating: 8.9 },
          { title: "Game of Thrones", watchTime: 10800, playCount: 1, episodesWatched: 73, year: 2011, rating: 9.3 },
          { title: "Stranger Things", watchTime: 7200, playCount: 1, episodesWatched: 34, year: 2016, rating: 8.7 },
          { title: "The Crown", watchTime: 6000, playCount: 1, episodesWatched: 40, year: 2016, rating: 8.6 },
        ],
        // Leaderboard data
        leaderboards: {
          watchTime: {
            leaderboard: [
              { userId: "user1", username: "MovieBuff", friendlyName: "Movie Buff", totalWatchTime: 120000, moviesWatchTime: 60000, showsWatchTime: 60000 },
              { userId: "user2", username: "BingeWatcher", friendlyName: "Binge Watcher", totalWatchTime: 96720, moviesWatchTime: 43200, showsWatchTime: 53520 },
              { userId: "user3", username: "CasualViewer", friendlyName: "Casual Viewer", totalWatchTime: 45000, moviesWatchTime: 30000, showsWatchTime: 15000 },
            ],
            userPosition: 2,
            totalUsers: 15,
          },
          topContent: {
            movies: [
              {
                title: "The Matrix",
                leaderboard: [
                  { userId: "user1", username: "MovieBuff", friendlyName: "Movie Buff", watchTime: 12000, playCount: 5 },
                  { userId: "user2", username: "BingeWatcher", friendlyName: "Binge Watcher", watchTime: 8160, playCount: 3 },
                ],
                userPosition: 2,
                totalWatchers: 8,
              },
              {
                title: "Inception",
                leaderboard: [
                  { userId: "user2", username: "BingeWatcher", friendlyName: "Binge Watcher", watchTime: 8880, playCount: 2 },
                  { userId: "user1", username: "MovieBuff", friendlyName: "Movie Buff", watchTime: 7200, playCount: 2 },
                ],
                userPosition: 1,
                totalWatchers: 6,
              },
            ],
            shows: [
              {
                title: "Breaking Bad",
                leaderboard: [
                  { userId: "user2", username: "BingeWatcher", friendlyName: "Binge Watcher", watchTime: 12000, playCount: 1, episodesWatched: 62 },
                  { userId: "user1", username: "MovieBuff", friendlyName: "Movie Buff", watchTime: 10800, playCount: 1, episodesWatched: 60 },
                ],
                userPosition: 1,
                totalWatchers: 12,
              },
              {
                title: "The Office",
                leaderboard: [
                  { userId: "user2", username: "BingeWatcher", friendlyName: "Binge Watcher", watchTime: 9600, playCount: 1, episodesWatched: 201 },
                  { userId: "user3", username: "CasualViewer", friendlyName: "Casual Viewer", watchTime: 4800, playCount: 1, episodesWatched: 100 },
                ],
                userPosition: 1,
                totalWatchers: 10,
              },
            ],
          },
        },
        // Server statistics
        serverStats: {
          serverName: "My Plex Server",
          totalStorage: 50000000000000, // ~50 TB
          totalStorageFormatted: "50 TB",
          librarySize: {
            movies: 15234,
            shows: 3421,
            episodes: 125678,
          },
        },
        // Overseerr statistics
        overseerrStats: {
          totalRequests: 47,
          totalServerRequests: 234,
          approvedRequests: 42,
          pendingRequests: 3,
          topRequestedGenres: [
            { genre: "Action", count: 15 },
            { genre: "Sci-Fi", count: 12 },
            { genre: "Drama", count: 10 },
            { genre: "Comedy", count: 8 },
            { genre: "Thriller", count: 2 },
          ],
        },
        // Watch time by month
        watchTimeByMonth: [
          { month: 1, monthName: "January", watchTime: 7200, topMovie: { title: "The Matrix", watchTime: 8160, playCount: 3, year: 1999 }, topShow: { title: "Breaking Bad", watchTime: 6000, playCount: 1, episodesWatched: 20, year: 2008 } },
          { month: 2, monthName: "February", watchTime: 8400, topMovie: { title: "Inception", watchTime: 8880, playCount: 2, year: 2010 }, topShow: { title: "The Office", watchTime: 4800, playCount: 1, episodesWatched: 25, year: 2005 } },
          { month: 3, monthName: "March", watchTime: 9600, topMovie: { title: "Interstellar", watchTime: 10200, playCount: 2, year: 2014 }, topShow: { title: "Game of Thrones", watchTime: 5400, playCount: 1, episodesWatched: 12, year: 2011 } },
          { month: 4, monthName: "April", watchTime: 7800, topMovie: { title: "The Dark Knight", watchTime: 9120, playCount: 2, year: 2008 }, topShow: { title: "Stranger Things", watchTime: 3600, playCount: 1, episodesWatched: 8, year: 2016 } },
          { month: 5, monthName: "May", watchTime: 10200, topMovie: { title: "Pulp Fiction", watchTime: 9240, playCount: 1, year: 1994 }, topShow: { title: "The Crown", watchTime: 3000, playCount: 1, episodesWatched: 10, year: 2016 } },
          { month: 6, monthName: "June", watchTime: 10800, topMovie: { title: "The Matrix", watchTime: 8160, playCount: 3, year: 1999 }, topShow: { title: "Breaking Bad", watchTime: 6000, playCount: 1, episodesWatched: 20, year: 2008 } },
          { month: 7, monthName: "July", watchTime: 9600, topMovie: { title: "Inception", watchTime: 8880, playCount: 2, year: 2010 }, topShow: { title: "The Office", watchTime: 4800, playCount: 1, episodesWatched: 25, year: 2005 } },
          { month: 8, monthName: "August", watchTime: 8400, topMovie: { title: "Interstellar", watchTime: 10200, playCount: 2, year: 2014 }, topShow: { title: "Game of Thrones", watchTime: 5400, playCount: 1, episodesWatched: 12, year: 2011 } },
          { month: 9, monthName: "September", watchTime: 7200, topMovie: { title: "The Dark Knight", watchTime: 9120, playCount: 2, year: 2008 }, topShow: { title: "Stranger Things", watchTime: 3600, playCount: 1, episodesWatched: 8, year: 2016 } },
          { month: 10, monthName: "October", watchTime: 7800, topMovie: { title: "Pulp Fiction", watchTime: 9240, playCount: 1, year: 1994 }, topShow: { title: "The Crown", watchTime: 3000, playCount: 1, episodesWatched: 10, year: 2016 } },
          { month: 11, monthName: "November", watchTime: 9000, topMovie: { title: "The Matrix", watchTime: 8160, playCount: 3, year: 1999 }, topShow: { title: "Breaking Bad", watchTime: 6000, playCount: 1, episodesWatched: 20, year: 2008 } },
          { month: 12, monthName: "December", watchTime: 9600, topMovie: { title: "Inception", watchTime: 8880, playCount: 2, year: 2010 }, topShow: { title: "The Office", watchTime: 4800, playCount: 1, episodesWatched: 25, year: 2005 } },
        ],
      }
    }

    try {
      const wrappedData: WrappedData = JSON.parse(userWrapped.data)
      return wrappedData.statistics
    } catch (error) {
      console.error("Failed to parse wrapped data:", error)
      return null
    }
  }, [userWrapped])

  // Generate example preview with placeholders replaced (synchronous client-side version)
  const examplePreview = useMemo(() => {
    if (!formData.template || !exampleStatistics) {
      return null
    }

    try {
      const currentYear = new Date().getFullYear()
      const template = formData.template
      const stats = exampleStatistics

      // Build replacement map (simplified version for preview)
      const replacements: Record<string, string> = {
        "{{userName}}": userName,
        "{{year}}": currentYear.toString(),
        "{{totalWatchTime}}": formatWatchTime(stats.totalWatchTime.total),
        "{{totalWatchTimeMinutes}}": stats.totalWatchTime.total.toString(),
        "{{moviesWatchTime}}": formatWatchTime(stats.totalWatchTime.movies),
        "{{moviesWatchTimeMinutes}}": stats.totalWatchTime.movies.toString(),
        "{{showsWatchTime}}": formatWatchTime(stats.totalWatchTime.shows),
        "{{showsWatchTimeMinutes}}": stats.totalWatchTime.shows.toString(),
        "{{moviesWatched}}": stats.moviesWatched.toString(),
        "{{showsWatched}}": stats.showsWatched.toString(),
        "{{episodesWatched}}": stats.episodesWatched.toString(),
        "{{topMoviesList}}": stats.topMovies.slice(0, 5).map((movie, idx) =>
          `${idx + 1}. ${movie.title}${movie.year ? ` (${movie.year})` : ""} - ${formatWatchTime(movie.watchTime)} watched (${movie.watchTime} minutes)`
        ).join("\n"),
        "{{topShowsList}}": stats.topShows.slice(0, 5).map((show, idx) =>
          `${idx + 1}. ${show.title}${show.year ? ` (${show.year})` : ""} - ${formatWatchTime(show.watchTime)} watched (${show.watchTime} minutes), ${show.episodesWatched} episodes`
        ).join("\n"),
        "{{topMoviesJson}}": JSON.stringify(stats.topMovies.slice(0, 5)),
        "{{topShowsJson}}": JSON.stringify(stats.topShows.slice(0, 5)),
        "{{leaderboardSection}}": stats.leaderboards ? `\n**Leaderboard Stats:**\n\n**Your Position in Overall Watch Time Leaderboard:**\nYou ranked #${stats.leaderboards.watchTime.userPosition || 1} out of ${stats.leaderboards.watchTime.totalUsers} users\n` : "",
        "{{serverStatsSection}}": stats.serverStats ? `\n**Plex Server Statistics:**\n- Server name: ${stats.serverStats.serverName}\n- Total storage: ${stats.serverStats.totalStorageFormatted}\n` : "",
        "{{overseerrStatsSection}}": stats.overseerrStats ? `\n**Overseerr Requests:**\n- Your requests: ${stats.overseerrStats.totalRequests}\n` : "",
        "{{watchTimeByMonthSection}}": stats.watchTimeByMonth && stats.watchTimeByMonth.length > 0 ? `\n**Watch Time by Month:**\n${stats.watchTimeByMonth.map(m => `- ${m.monthName}: ${formatWatchTime(m.watchTime)}`).join("\n")}\n` : "",
        "{{serverName}}": stats.serverStats?.serverName || "",
        "{{bingeWatcher}}": stats.topShows.some(s => s.episodesWatched > 20) ? "true" : "false",
        "{{discoveryScore}}": Math.min(100, Math.max(0, Math.floor((stats.moviesWatched + stats.showsWatched) / 10))).toString(),
        "{{overseerrAnimationDelay}}": stats.overseerrStats ? (stats.serverStats ? "12000" : "10000") : "",
        "{{insightsAnimationDelay}}": stats.overseerrStats ? "14000" : (stats.serverStats ? "12000" : "10000"),
        "{{funFactsAnimationDelay}}": stats.overseerrStats ? "16000" : (stats.serverStats ? "14000" : "12000"),
        "{{serverStatsFacts}}": stats.serverStats ? `,\n          "[EXAMPLE - REPLACE] Fun fact about ${stats.serverStats.serverName}'s library size"` : "",
        "{{serverStatsContent}}": stats.serverStats ? `A fun, engaging introductory message about ${stats.serverStats.serverName}.` : "A fun, engaging introductory message about your viewing habits.",
      }

      // Replace all placeholders
      let result = template
      for (const [placeholder, value] of Object.entries(replacements)) {
        if (placeholder === "{{serverName}}") continue
        result = result.replace(new RegExp(placeholder.replace(/[{}]/g, "\\$&"), "g"), value)
      }
      // Second pass for serverName
      result = result.replace(new RegExp("{{serverName}}".replace(/[{}]/g, "\\$&"), "g"), replacements["{{serverName}}"] || "")

      return result
    } catch (error) {
      console.error("Failed to generate preview:", error)
      return null
    }
  }, [formData.template, exampleStatistics, userName])

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)

    startTransition(async () => {
      const result = template
        ? await updatePromptTemplate(template.id, formData)
        : await createPromptTemplate(formData)

      if (result.success) {
        router.push("/admin/prompts")
        router.refresh()
      } else {
        setError(result.error || "Failed to save template")
      }
    })
  }

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value, type } = e.target

    // Handle template textarea with undo/redo support
    if (name === "template" && type !== "checkbox") {
      if (!isUndoRedo) {
        // Save to history (remove any future history if we're not at the end)
        const newHistory = history.slice(0, historyIndex + 1)
        newHistory.push(value)
        setHistory(newHistory)
        setHistoryIndex(newHistory.length - 1)
      }
    }

    setFormData((prev) => ({
      ...prev,
      [name]:
        type === "checkbox" ? (e.target as HTMLInputElement).checked : value,
    }))
  }

  // Undo function
  const handleUndo = (e?: React.KeyboardEvent | React.MouseEvent) => {
    if (e) {
      e.preventDefault()
    }

    if (historyIndex > 0) {
      const newIndex = historyIndex - 1
      setIsUndoRedo(true)
      setHistoryIndex(newIndex)
      setFormData((prev) => ({
        ...prev,
        template: history[newIndex],
      }))
      setTimeout(() => setIsUndoRedo(false), 0)
    }
  }

  // Redo function
  const handleRedo = (e?: React.KeyboardEvent | React.MouseEvent) => {
    if (e) {
      e.preventDefault()
    }

    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1
      setIsUndoRedo(true)
      setHistoryIndex(newIndex)
      setFormData((prev) => ({
        ...prev,
        template: history[newIndex],
      }))
      setTimeout(() => setIsUndoRedo(false), 0)
    }
  }

  // Handle keyboard shortcuts
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Ctrl+Z or Cmd+Z for undo
    if ((e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey) {
      handleUndo(e)
      return
    }

    // Ctrl+Y or Ctrl+Shift+Z or Cmd+Shift+Z for redo
    if (
      ((e.ctrlKey || e.metaKey) && e.key === "y") ||
      ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "z")
    ) {
      handleRedo(e)
      return
    }
  }

  const insertPlaceholder = (placeholder: string) => {
    const textarea = document.getElementById("template") as HTMLTextAreaElement
    if (textarea) {
      // Preserve scroll position and cursor position
      const scrollTop = textarea.scrollTop
      const scrollLeft = textarea.scrollLeft
      const start = textarea.selectionStart
      const end = textarea.selectionEnd
      const text = formData.template
      const newText =
        text.substring(0, start) + placeholder + text.substring(end)

      // Save to history before inserting
      const newHistory = history.slice(0, historyIndex + 1)
      newHistory.push(newText)
      setHistory(newHistory)
      setHistoryIndex(newHistory.length - 1)

      setFormData((prev) => ({ ...prev, template: newText }))

      // Save as recent placeholder
      if (typeof window !== "undefined") {
        localStorage.setItem("prompt-template-recent-placeholder", placeholder)
        setRecentPlaceholder(placeholder)
      }

      // Restore focus and cursor position without auto-scrolling
      setTimeout(() => {
        const newCursorPos = start + placeholder.length

        // Set cursor position first (this might cause auto-scroll)
        textarea.setSelectionRange(newCursorPos, newCursorPos)

        // Immediately restore the original scroll position to prevent auto-scroll
        // This works because setSelectionRange triggers scroll, but we override it
        textarea.scrollTop = scrollTop
        textarea.scrollLeft = scrollLeft

        // Only adjust scroll if cursor would be out of view after restoration
        // Calculate approximate cursor position
        const textBeforeCursor = textarea.value.substring(0, newCursorPos)
        const linesBeforeCursor = textBeforeCursor.split('\n').length - 1
        const lineHeight = parseFloat(getComputedStyle(textarea).lineHeight) || 20
        const approximateCursorTop = linesBeforeCursor * lineHeight

        // Check if cursor is within visible area
        const viewportTop = scrollTop
        const viewportBottom = scrollTop + textarea.clientHeight
        const cursorVisible = approximateCursorTop >= viewportTop - lineHeight && approximateCursorTop <= viewportBottom + lineHeight

        // Only scroll if cursor is significantly out of view
        if (!cursorVisible && Math.abs(approximateCursorTop - scrollTop) > textarea.clientHeight / 2) {
          // Scroll to show cursor with some padding
          textarea.scrollTop = Math.max(0, approximateCursorTop - lineHeight * 3)
        } else {
          // Keep original scroll position
          textarea.scrollTop = scrollTop
        }

        textarea.focus()
      }, 0)
    }
    setShowPlaceholderModal(false)
    setPlaceholderSearch("")
  }

  return (
    <div className="space-y-8">
      {error && (
        <div className="bg-red-500/10 border-l-4 border-red-500/50 text-red-400 px-4 py-3 rounded-r-lg flex items-start gap-3 shadow-lg shadow-red-500/5">
          <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-sm font-medium">{error}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Basic Info Section */}
        <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6 shadow-lg shadow-slate-900/20">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-white mb-1 flex items-center gap-2">
              <svg className="w-5 h-5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Template Information
            </h2>
            <p className="text-xs text-slate-400 mt-1">Basic details about your prompt template</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label
                htmlFor="name"
                className="block text-sm font-medium text-slate-300"
              >
                Template Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                id="name"
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
                className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all"
                placeholder="e.g., Default Wrapped Prompt"
              />
            </div>

            <div className="space-y-2">
              <label
                htmlFor="description"
                className="block text-sm font-medium text-slate-300"
              >
                Description
                <span className="text-xs text-slate-500 font-normal ml-2">(optional)</span>
              </label>
              <input
                type="text"
                id="description"
                name="description"
                value={formData.description || ""}
                onChange={handleChange}
                className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 transition-all"
                placeholder="Brief description of this template"
              />
            </div>
          </div>

          <div className="mt-6 pt-6 border-t border-slate-700/50">
            <label className="flex items-center gap-3 cursor-pointer group">
              <input
                type="checkbox"
                id="isActive"
                name="isActive"
                checked={formData.isActive}
                onChange={handleChange}
                className="w-5 h-5 rounded bg-slate-900/50 border-slate-700/50 text-cyan-600 focus:ring-2 focus:ring-cyan-500/50 focus:ring-offset-2 focus:ring-offset-slate-800 transition-all cursor-pointer"
              />
              <div className="flex-1">
                <span className="text-sm font-medium text-slate-300 group-hover:text-white transition-colors">
                  Set as active template
                </span>
                <p className="text-xs text-slate-500 mt-0.5">
                  Only one template can be active at a time
                </p>
              </div>
              {formData.isActive && (
                <span className="px-2 py-1 text-xs font-medium bg-cyan-500/20 text-cyan-400 rounded border border-cyan-500/30">
                  Active
                </span>
              )}
            </label>
          </div>
        </div>

        {/* Template Editor */}
        <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6 flex flex-col min-h-[600px] shadow-lg shadow-slate-900/20">
          <div className="mb-5 flex-shrink-0">
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <label
                    htmlFor="template"
                    className="text-sm font-semibold text-white flex items-center gap-2"
                  >
                    <svg className="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Template Content <span className="text-red-400">*</span>
                  </label>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      onClick={handleUndo}
                      disabled={historyIndex === 0}
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      aria-label="Undo (Ctrl+Z)"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                      </svg>
                    </Button>
                    <Button
                      type="button"
                      onClick={handleRedo}
                      disabled={historyIndex === history.length - 1}
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      aria-label="Redo (Ctrl+Y)"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" />
                      </svg>
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Use placeholders like <code className="px-1.5 py-0.5 bg-cyan-500/10 text-cyan-400 rounded font-mono text-xs">{'{{userName}}'}</code>{" "}
                  to insert dynamic data. Click chips below or use the search button for all placeholders.
                </p>
              </div>
              <Button
                type="button"
                onClick={() => setShowPlaceholderModal(true)}
                variant="secondary"
                size="sm"
                className="flex-shrink-0"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                Search All
              </Button>
            </div>

            {/* Quick Access Placeholder Chips */}
            <div className="flex flex-wrap gap-2 mb-4 p-3 bg-slate-900/30 rounded-lg border border-slate-700/30">
              {quickPlaceholders.map((placeholder, index) => {
                const placeholderInfo = placeholders.find(p => p.placeholder === placeholder)
                if (!placeholderInfo) return null
                const isRecent = index === 0 && placeholder === recentPlaceholder
                return (
                  <Button
                    key={placeholder}
                    type="button"
                    onClick={() => insertPlaceholder(placeholder)}
                    variant="ghost"
                    size="sm"
                    className={`font-mono active:scale-95 group relative ${
                      isRecent
                        ? "bg-cyan-500/20 hover:bg-cyan-500/30 border-2 border-cyan-500/50 text-cyan-300 hover:text-cyan-200"
                        : "bg-slate-800/50 hover:bg-cyan-500/20 border border-slate-700/50 hover:border-cyan-500/50 text-cyan-400 hover:text-cyan-300"
                    }`}
                    title={isRecent ? `${placeholderInfo.description} (Recently used)` : placeholderInfo.description}
                  >
                    {isRecent && (
                      <svg className="w-3 h-3 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    )}
                    <span>{placeholder}</span>
                    <svg className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </Button>
                )
              })}
            </div>
          </div>

          <div className="flex-1 flex flex-col min-h-0">
            <textarea
              id="template"
              name="template"
              value={formData.template}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              required
              className="flex-1 w-full px-4 py-3 bg-slate-900/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50 font-mono text-sm resize-none min-h-0 transition-all"
              placeholder="Enter your prompt template with placeholders like {{userName}}, {{year}}, etc."
            />
          </div>
        </div>

        {/* Placeholder Search Modal */}
        {showPlaceholderModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowPlaceholderModal(false)}>
            <div className="bg-slate-800 border border-slate-700 rounded-xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
              {/* Modal Header */}
              <div className="p-6 border-b border-slate-700/50 flex-shrink-0">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                    <svg className="w-5 h-5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                    </svg>
                    All Placeholders
                  </h3>
                  <Button
                    onClick={() => {
                      setShowPlaceholderModal(false)
                      setPlaceholderSearch("")
                    }}
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </Button>
                </div>
                <div className="relative">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    type="text"
                    value={placeholderSearch}
                    onChange={(e) => setPlaceholderSearch(e.target.value)}
                    placeholder="Search placeholders..."
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-900/50 border border-slate-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-500/50"
                    autoFocus
                  />
                </div>
              </div>

              {/* Modal Content */}
              <div className="flex-1 overflow-y-auto p-6">
                {placeholderSearch.trim() ? (
                  // Search Results
                  <div className="space-y-3">
                    {filteredPlaceholders.length > 0 ? (
                      filteredPlaceholders.map(({ placeholder, description }) => (
                        <Button
                          key={placeholder}
                          type="button"
                          onClick={() => insertPlaceholder(placeholder)}
                          variant="ghost"
                          className="w-full h-auto justify-start text-left p-4 bg-slate-900/50 hover:bg-slate-800/80 border border-slate-700/50 hover:border-cyan-500/30 group"
                        >
                          <div className="flex flex-col items-start">
                            <code className="text-cyan-400 text-sm font-mono group-hover:text-cyan-300 transition-colors block mb-1.5 font-semibold">
                              {placeholder}
                            </code>
                            <p className="text-xs text-slate-400 group-hover:text-slate-300 leading-relaxed">{description}</p>
                          </div>
                        </Button>
                      ))
                    ) : (
                      <div className="text-center py-12 text-slate-400">
                        <p>No placeholders found matching &quot;{placeholderSearch}&quot;</p>
                      </div>
                    )}
                  </div>
                ) : (
                  // Grouped Placeholders
                  <div className="space-y-6">
                    {Object.entries(placeholderGroups).map(([category, items]) => (
                      items.length > 0 && (
                        <div key={category}>
                          <h4 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
                            <span className="w-1 h-4 bg-cyan-400 rounded-full"></span>
                            {category}
                          </h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {items.map(({ placeholder, description }) => (
                              <Button
                                key={placeholder}
                                type="button"
                                onClick={() => insertPlaceholder(placeholder)}
                                variant="ghost"
                                className="h-auto justify-start text-left p-3 bg-slate-900/50 hover:bg-slate-800/80 border border-slate-700/50 hover:border-cyan-500/30 group"
                              >
                                <div className="flex flex-col items-start">
                                  <code className="text-cyan-400 text-xs font-mono group-hover:text-cyan-300 transition-colors block mb-1 font-semibold">
                                    {placeholder}
                                  </code>
                                  <p className="text-xs text-slate-400 group-hover:text-slate-300 leading-snug">{description}</p>
                                </div>
                              </Button>
                            ))}
                          </div>
                        </div>
                      )
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Preview Section */}
        {examplePreview && formData.template && (
          <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-xl p-6 shadow-lg shadow-slate-900/20">
            <div className="mb-5">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <svg className="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                  Live Preview
                </h3>
                <span className="px-2 py-1 text-xs font-medium bg-cyan-500/20 text-cyan-400 rounded border border-cyan-500/30">
                  Using example data
                </span>
              </div>
              <p className="text-xs text-slate-400">
                See how placeholders are replaced with example data in real-time
              </p>
            </div>
            <div className="bg-slate-900/50 border border-slate-700/50 rounded-lg p-5 max-h-96 overflow-y-auto">
              <pre className="text-xs text-slate-300 whitespace-pre-wrap font-mono leading-relaxed">
                {examplePreview}
              </pre>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-6 border-t border-slate-700/50">
          <Button
            type="button"
            onClick={() => router.back()}
            variant="secondary"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={isPending}
            variant="primary"
          >
            {isPending ? (
              <>
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Saving...
              </>
            ) : (
              <>
                {template ? "Update Template" : "Create Template"}
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  )
}

