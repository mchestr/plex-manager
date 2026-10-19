/**
 * The edit form shows an announcement's expiry as wall time in the server
 * zone, whatever the browser's zone (P2.2).
 */

import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { AnnouncementsPageClient } from "@/components/admin/announcements/announcements-page-client"

jest.mock("@/actions/announcements", () => ({
  createAnnouncement: jest.fn(),
  deleteAnnouncement: jest.fn(),
  getAllAnnouncements: jest.fn(),
  setAnnouncementActive: jest.fn(),
  updateAnnouncement: jest.fn(),
}))

jest.mock("@/components/ui/toast", () => ({
  useToast: () => ({ showError: jest.fn(), showSuccess: jest.fn() }),
}))

const announcement = {
  id: "ann-1",
  title: "Maintenance",
  content: "Down for an hour",
  priority: 0,
  isActive: true,
  createdAt: "2026-12-01T00:00:00.000Z",
  // 23:59 on 31 December in Chicago (CST, UTC-6)
  expiresAt: "2027-01-01T05:59:00.000Z",
}

describe("AnnouncementsPageClient", () => {
  it("pre-fills the expiry in the server zone and names the zone", async () => {
    const user = userEvent.setup()
    render(<AnnouncementsPageClient initialAnnouncements={[announcement]} zone="America/Chicago" />)

    await user.click(screen.getByTestId("edit-announcement-ann-1"))

    expect(screen.getByTestId("announcement-expires-input")).toHaveValue("2026-12-31T23:59")
    expect(screen.getByTestId("announcement-expires-zone")).toHaveTextContent("Times in America/Chicago.")
  })
})
