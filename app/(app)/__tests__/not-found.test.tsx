/**
 * A member page's 404: the same StatusScreen as the app-wide one, but no
 * shell of its own, so it sits in AppShell's one main.
 */

import { render, screen } from "@testing-library/react"
import { mockReset } from "jest-mock-extended"

import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import NotFound from "@/app/(app)/not-found"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)

beforeEach(() => mockReset(prismaMock))

describe("app/(app)/not-found.tsx", () => {
  it("shows the 404 StatusScreen without a main of its own", async () => {
    prismaMock.discordIntegration.findUnique.mockResolvedValue(null)
    const { container } = render(await NotFound())

    expect(screen.getByTestId("status-screen-code")).toHaveTextContent("404")
    expect(screen.getByRole("link", { name: "Go to home" })).toHaveAttribute("href", "/")
    expect(container.querySelector("main")).toBeNull()
  })

  it("links to the Discord invite when a code exists", async () => {
    prismaMock.discordIntegration.findUnique.mockResolvedValue({ serverInviteCode: "abc123" } as never)
    render(await NotFound())

    expect(screen.getByTestId("not-found-discord")).toHaveAttribute("href", "https://discord.gg/abc123")
  })
})
