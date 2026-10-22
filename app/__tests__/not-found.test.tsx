/**
 * The app-wide 404 (P10.17, BP-35): a StatusScreen in PublicShell, with the
 * Discord action only when the owner has set an invite code.
 */

import { render, screen } from "@testing-library/react"
import { mockReset } from "jest-mock-extended"

import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import NotFound from "@/app/not-found"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/brand", () => ({ serverName: jest.fn().mockResolvedValue("Northfield Plex") }))
jest.mock("@/components/shell/public-sign-out", () => ({ PublicSignOut: () => null }))

beforeEach(() => mockReset(prismaMock))

async function renderNotFound() {
  render(await NotFound())
}

describe("app/not-found.tsx", () => {
  it("shows the 404 StatusScreen with Go to home", async () => {
    prismaMock.discordIntegration.findUnique.mockResolvedValue(null)
    await renderNotFound()

    expect(screen.getByTestId("status-screen")).toBeInTheDocument()
    expect(screen.getByRole("heading", { level: 1, name: "This page doesn't exist" })).toBeInTheDocument()
    expect(screen.getByTestId("status-screen-code")).toHaveTextContent("404")
    expect(screen.getByRole("link", { name: "Go to home" })).toHaveAttribute("href", "/")
    expect(screen.getByText("Northfield Plex")).toBeInTheDocument()
  })

  it("leaves out the Discord action without an invite code", async () => {
    prismaMock.discordIntegration.findUnique.mockResolvedValue({ serverInviteCode: null } as never)
    await renderNotFound()

    expect(screen.queryByTestId("not-found-discord")).not.toBeInTheDocument()
  })

  it("links to the Discord invite when a code exists", async () => {
    prismaMock.discordIntegration.findUnique.mockResolvedValue({ serverInviteCode: "abc123" } as never)
    await renderNotFound()

    expect(screen.getByTestId("not-found-discord")).toHaveAttribute("href", "https://discord.gg/abc123")
    expect(screen.getByRole("link", { name: /Ask for help on Discord/ })).toBeInTheDocument()
  })
})
