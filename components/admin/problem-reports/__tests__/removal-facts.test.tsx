/**
 * The confirm's facts for Remove the file and search: the release that will
 * be blocklisted or why none is, the recycle bin, and Plex's trash.
 */

import { render, screen } from "@testing-library/react"

import { RemovalFacts } from "@/components/admin/problem-reports/removal-facts"
import { getRemovalFacts } from "@/lib/data/problem-removal"

jest.mock("@/lib/data/problem-removal", () => ({ getRemovalFacts: jest.fn() }))

beforeEach(() => jest.resetAllMocks())

describe("RemovalFacts", () => {
  it("names the release to blocklist, says the file is deleted for good without a recycle bin, and warns about Plex's trash", async () => {
    jest.mocked(getRemovalFacts).mockResolvedValue({ service: "Radarr", blocklists: "Heat.1995.1080p.BluRay-BAD", recycleBin: false, emptiesTrash: true })
    render(await RemovalFacts({ reportId: "report-1" }))

    expect(screen.getByTestId("admin-problem-report-removal-blocklist")).toHaveTextContent("Radarr marks Heat.1995.1080p.BluRay-BAD failed first, so it isn't grabbed again.")
    expect(screen.getByTestId("admin-problem-report-removal-recycle-bin")).toHaveTextContent("Radarr has no recycle bin set, so the file is deleted for good.")
    expect(screen.getByTestId("admin-problem-report-removal-trash")).toHaveTextContent("the title may come back as a new item")
    expect(getRemovalFacts).toHaveBeenCalledWith("report-1")
  })

  it("says when nothing will be blocklisted, when the recycle bin keeps the file or couldn't be checked, and stays quiet about a trash Plex keeps", async () => {
    jest.mocked(getRemovalFacts).mockResolvedValueOnce({ service: "Sonarr", blocklists: null, recycleBin: true, emptiesTrash: false })
    const { unmount } = render(await RemovalFacts({ reportId: "report-1" }))

    expect(screen.getByTestId("admin-problem-report-removal-blocklist")).toHaveTextContent("so nothing is blocklisted and the same release could come back")
    expect(screen.getByTestId("admin-problem-report-removal-recycle-bin")).toHaveTextContent("Sonarr moves the file to its recycle bin.")
    expect(screen.queryByTestId("admin-problem-report-removal-trash")).not.toBeInTheDocument()
    unmount()

    jest.mocked(getRemovalFacts).mockResolvedValueOnce({ service: "Sonarr", blocklists: null, recycleBin: null, emptiesTrash: null })
    render(await RemovalFacts({ reportId: "report-1" }))
    expect(screen.getByTestId("admin-problem-report-removal-recycle-bin")).toHaveTextContent("Sonarr's recycle bin couldn't be checked.")
  })

  it("says the file couldn't be read, and that the fix checks it again", async () => {
    jest.mocked(getRemovalFacts).mockResolvedValue(null)
    render(await RemovalFacts({ reportId: "report-1" }))

    expect(screen.getByTestId("admin-problem-report-removal-facts")).toHaveTextContent("The fix checks the file again when it runs.")
  })
})
