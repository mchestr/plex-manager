import { StatisticsViewer } from "@/components/admin/playground/statistics-viewer"
import { WrappedStatistics } from "@/types/wrapped"
import { fireEvent, render, screen } from "@testing-library/react"

describe("StatisticsViewer", () => {
  const mockStatistics: WrappedStatistics = {
    totalWatchTime: {
      total: 36000,
      movies: 18000,
      shows: 18000,
    },
    moviesWatched: 50,
    showsWatched: 20,
    episodesWatched: 150,
    topMovies: [
      {
        title: "Test Movie 1",
        year: 2023,
        watchTime: 7200,
        playCount: 3,
        lastWatchedAt: "2024-01-01",
      },
      {
        title: "Test Movie 2",
        year: 2022,
        watchTime: 5400,
        playCount: 2,
        lastWatchedAt: "2024-01-02",
      },
    ],
    topShows: [
      {
        title: "Test Show 1",
        year: 2023,
        watchTime: 10800,
        episodesWatched: 12,
        lastWatchedAt: "2024-01-01",
      },
    ],
    topGenres: [],
    watchTimeByMonth: [
      { month: 1, monthName: "January", watchTime: 3600 },
      { month: 2, monthName: "February", watchTime: 5400 },
    ],
    serverStats: {
      serverName: "Test Server",
      totalStorageFormatted: "10 TB",
      librarySize: {
        movies: 1000,
        shows: 500,
        episodes: 5000,
      },
    },
    overseerrStats: {
      totalRequests: 100,
      approvedRequests: 80,
      pendingRequests: 20,
    },
  }

  const mockProps = {
    statistics: mockStatistics,
    viewMode: "formatted" as const,
    onViewModeChange: jest.fn(),
  }

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe("Basic Rendering", () => {
    it("should render the component", () => {
      render(<StatisticsViewer {...mockProps} />)

      expect(screen.getByText("Statistics Data")).toBeInTheDocument()
    })

    it("should render view mode toggle buttons", () => {
      render(<StatisticsViewer {...mockProps} />)

      expect(screen.getByRole("button", { name: /formatted/i })).toBeInTheDocument()
      expect(screen.getByRole("button", { name: /json/i })).toBeInTheDocument()
    })
  })

  describe("View Mode Toggle", () => {
    it("should call onViewModeChange with formatted when formatted button is clicked", () => {
      render(<StatisticsViewer {...mockProps} viewMode="json" />)

      const formattedButton = screen.getByRole("button", { name: /formatted/i })
      fireEvent.click(formattedButton)

      expect(mockProps.onViewModeChange).toHaveBeenCalledWith("formatted")
    })

    it("should call onViewModeChange with json when json button is clicked", () => {
      render(<StatisticsViewer {...mockProps} viewMode="formatted" />)

      const jsonButton = screen.getByRole("button", { name: /json/i })
      fireEvent.click(jsonButton)

      expect(mockProps.onViewModeChange).toHaveBeenCalledWith("json")
    })

    it("should render formatted button when in formatted mode", () => {
      render(<StatisticsViewer {...mockProps} viewMode="formatted" />)

      const formattedButton = screen.getByRole("button", { name: /formatted/i })
      expect(formattedButton).toBeInTheDocument()
    })

    it("should render json button when in json mode", () => {
      render(<StatisticsViewer {...mockProps} viewMode="json" />)

      const jsonButton = screen.getByRole("button", { name: /json/i })
      expect(jsonButton).toBeInTheDocument()
    })
  })

  describe("Formatted View", () => {
    it("should display summary statistics", () => {
      const { container } = render(<StatisticsViewer {...mockProps} viewMode="formatted" />)

      expect(screen.getByText("600h")).toBeInTheDocument() // 36000 / 60

      // Check for movies watched in the specific context
      const moviesDiv = container.querySelector(".text-purple-400")
      expect(moviesDiv).toHaveTextContent("50")

      // Check for shows watched in the specific context
      const showsDiv = container.querySelector(".text-green-400")
      expect(showsDiv).toHaveTextContent("20")

      // Check for episodes
      const episodesDiv = container.querySelector(".text-yellow-400")
      expect(episodesDiv).toHaveTextContent("150")
    })

    it("should display top movies section", () => {
      render(<StatisticsViewer {...mockProps} viewMode="formatted" />)

      expect(screen.getByText("Top Movies")).toBeInTheDocument()
      expect(screen.getByText("Test Movie 1")).toBeInTheDocument()
      expect(screen.getByText("Test Movie 2")).toBeInTheDocument()
    })

    it("should display movie watch time and play count", () => {
      render(<StatisticsViewer {...mockProps} viewMode="formatted" />)

      expect(screen.getByText(/120h • 3x/)).toBeInTheDocument() // 7200 / 60
      expect(screen.getByText(/90h • 2x/)).toBeInTheDocument() // 5400 / 60
    })

    it("should display movie years", () => {
      const { container } = render(<StatisticsViewer {...mockProps} viewMode="formatted" />)

      const yearElements = container.querySelectorAll(".text-slate-500")
      const yearTexts = Array.from(yearElements).map((el) => el.textContent)
      expect(yearTexts).toContain("2023")
      expect(yearTexts).toContain("2022")
    })

    it("should display top shows section", () => {
      render(<StatisticsViewer {...mockProps} viewMode="formatted" />)

      expect(screen.getByText("Top Shows")).toBeInTheDocument()
      expect(screen.getByText("Test Show 1")).toBeInTheDocument()
    })

    it("should display show watch time and episodes", () => {
      render(<StatisticsViewer {...mockProps} viewMode="formatted" />)

      expect(screen.getByText(/180h • 12 eps/)).toBeInTheDocument() // 10800 / 60
    })

    it("should display watch time by month", () => {
      render(<StatisticsViewer {...mockProps} viewMode="formatted" />)

      expect(screen.getByText("Watch Time by Month")).toBeInTheDocument()
      expect(screen.getByText("January")).toBeInTheDocument()
      expect(screen.getByText("February")).toBeInTheDocument()
      expect(screen.getByText("60h")).toBeInTheDocument() // 3600 / 60
      expect(screen.getByText("90h")).toBeInTheDocument() // 5400 / 60
    })

    it("should display server statistics", () => {
      render(<StatisticsViewer {...mockProps} viewMode="formatted" />)

      expect(screen.getByText("Server Statistics")).toBeInTheDocument()
      expect(screen.getByText("Test Server")).toBeInTheDocument()
      expect(screen.getByText("10 TB")).toBeInTheDocument()
      expect(screen.getByText("1,000")).toBeInTheDocument()
      expect(screen.getByText("500")).toBeInTheDocument()
    })

    it("should display overseerr statistics", () => {
      const { container } = render(<StatisticsViewer {...mockProps} viewMode="formatted" />)

      expect(screen.getByText("Overseerr Statistics")).toBeInTheDocument()

      // Check for overseerr stats in their specific section
      const overseerrSection = Array.from(container.querySelectorAll("h5")).find(
        (el) => el.textContent === "Overseerr Statistics"
      )?.parentElement

      expect(overseerrSection).toBeInTheDocument()
      expect(overseerrSection).toHaveTextContent("100")
      expect(overseerrSection).toHaveTextContent("80")
      expect(overseerrSection).toHaveTextContent("20")
    })

    it("should limit top movies to 5", () => {
      const manyMovies = Array.from({ length: 10 }, (_, i) => ({
        title: `Movie ${i + 1}`,
        year: 2023,
        watchTime: 3600,
        playCount: 1,
        lastWatchedAt: "2024-01-01",
      }))

      render(
        <StatisticsViewer
          {...mockProps}
          statistics={{ ...mockStatistics, topMovies: manyMovies }}
        />
      )

      expect(screen.getByText("Movie 1")).toBeInTheDocument()
      expect(screen.getByText("Movie 5")).toBeInTheDocument()
      expect(screen.queryByText("Movie 6")).not.toBeInTheDocument()
    })

    it("should limit top shows to 5", () => {
      const manyShows = Array.from({ length: 10 }, (_, i) => ({
        title: `Show ${i + 1}`,
        year: 2023,
        watchTime: 3600,
        episodesWatched: 10,
        lastWatchedAt: "2024-01-01",
      }))

      render(
        <StatisticsViewer
          {...mockProps}
          statistics={{ ...mockStatistics, topShows: manyShows }}
        />
      )

      expect(screen.getByText("Show 1")).toBeInTheDocument()
      expect(screen.getByText("Show 5")).toBeInTheDocument()
      expect(screen.queryByText("Show 6")).not.toBeInTheDocument()
    })
  })

  describe("JSON View", () => {
    it("should display JSON when in json mode", () => {
      const { container } = render(<StatisticsViewer {...mockProps} viewMode="json" />)

      const preElement = container.querySelector("pre")
      expect(preElement).toBeInTheDocument()
      // Check that it contains JSON structure
      expect(preElement?.textContent).toContain('"totalWatchTime"')
      expect(preElement?.textContent).toContain('"moviesWatched"')
    })

    it("should not display formatted view in json mode", () => {
      render(<StatisticsViewer {...mockProps} viewMode="json" />)

      expect(screen.queryByText("Top Movies")).not.toBeInTheDocument()
      expect(screen.queryByText("Top Shows")).not.toBeInTheDocument()
    })

    it("should format JSON with proper indentation", () => {
      const { container } = render(<StatisticsViewer {...mockProps} viewMode="json" />)

      const preElement = container.querySelector("pre")
      const jsonText = preElement?.textContent || ""
      expect(jsonText).toContain("  ") // Check for indentation
    })
  })

  describe("Conditional Rendering", () => {
    it("should not render top movies section when empty", () => {
      render(
        <StatisticsViewer
          {...mockProps}
          statistics={{ ...mockStatistics, topMovies: [] }}
        />
      )

      expect(screen.queryByText("Top Movies")).not.toBeInTheDocument()
    })

    it("should not render top shows section when empty", () => {
      render(
        <StatisticsViewer
          {...mockProps}
          statistics={{ ...mockStatistics, topShows: [] }}
        />
      )

      expect(screen.queryByText("Top Shows")).not.toBeInTheDocument()
    })

    it("should not render watch time by month when empty", () => {
      render(
        <StatisticsViewer
          {...mockProps}
          statistics={{ ...mockStatistics, watchTimeByMonth: [] }}
        />
      )

      expect(screen.queryByText("Watch Time by Month")).not.toBeInTheDocument()
    })

    it("should not render server stats when undefined", () => {
      render(
        <StatisticsViewer
          {...mockProps}
          statistics={{ ...mockStatistics, serverStats: undefined }}
        />
      )

      expect(screen.queryByText("Server Statistics")).not.toBeInTheDocument()
    })

    it("should not render overseerr stats when undefined", () => {
      render(
        <StatisticsViewer
          {...mockProps}
          statistics={{ ...mockStatistics, overseerrStats: undefined }}
        />
      )

      expect(screen.queryByText("Overseerr Statistics")).not.toBeInTheDocument()
    })
  })

  describe("Styling", () => {
    it("should have scrollable container", () => {
      const { container } = render(<StatisticsViewer {...mockProps} />)

      const scrollableDiv = container.querySelector(".max-h-96")
      expect(scrollableDiv).toBeInTheDocument()
      expect(scrollableDiv).toHaveClass("overflow-y-auto")
    })

    it("should style formatted view with proper colors", () => {
      const { container } = render(<StatisticsViewer {...mockProps} viewMode="formatted" />)

      const watchTimeElement = screen.getByText("600h")
      expect(watchTimeElement).toHaveClass("text-cyan-400")
    })

    it("should style JSON view with monospace font", () => {
      const { container } = render(<StatisticsViewer {...mockProps} viewMode="json" />)

      const preElement = container.querySelector("pre")
      expect(preElement).toHaveClass("whitespace-pre-wrap")
    })
  })

  describe("Number Formatting", () => {
    it("should format large numbers with commas", () => {
      render(
        <StatisticsViewer
          {...mockProps}
          statistics={{
            ...mockStatistics,
            episodesWatched: 12345,
            serverStats: {
              ...mockStatistics.serverStats!,
              librarySize: {
                movies: 123456,
                shows: 78901,
                episodes: 234567,
              },
            },
          }}
        />
      )

      expect(screen.getByText("12,345")).toBeInTheDocument()
      expect(screen.getByText("123,456")).toBeInTheDocument()
      expect(screen.getByText("78,901")).toBeInTheDocument()
    })
  })

  describe("Edge Cases", () => {
    it("should handle zero watch time", () => {
      render(
        <StatisticsViewer
          {...mockProps}
          statistics={{
            ...mockStatistics,
            totalWatchTime: { total: 0, movies: 0, shows: 0 },
          }}
        />
      )

      expect(screen.getByText("0h")).toBeInTheDocument()
    })

    it("should handle movies without year", () => {
      render(
        <StatisticsViewer
          {...mockProps}
          statistics={{
            ...mockStatistics,
            topMovies: [
              {
                title: "Movie Without Year",
                watchTime: 3600,
                playCount: 1,
                lastWatchedAt: "2024-01-01",
              },
            ],
          }}
        />
      )

      expect(screen.getByText("Movie Without Year")).toBeInTheDocument()
    })

    it("should handle shows without year", () => {
      render(
        <StatisticsViewer
          {...mockProps}
          statistics={{
            ...mockStatistics,
            topShows: [
              {
                title: "Show Without Year",
                watchTime: 3600,
                episodesWatched: 10,
                lastWatchedAt: "2024-01-01",
              },
            ],
          }}
        />
      )

      expect(screen.getByText("Show Without Year")).toBeInTheDocument()
    })
  })
})

