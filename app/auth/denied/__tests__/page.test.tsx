/**
 * `/auth/denied` (P10.27, UI-15): a StatusScreen "You're not a member of
 * {serverName} yet" with Ask for an invite on Discord when a code exists, and
 * Sign out. The particles, rings and pulsing heading are gone.
 */

import fs from "node:fs"
import path from "node:path"

import { render, screen } from "@testing-library/react"
import { mockReset } from "jest-mock-extended"

import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { getSetupStatus } from "@/lib/setup/status"
import DeniedAccessPage from "@/app/auth/denied/page"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/brand", () => ({ serverName: jest.fn().mockResolvedValue("Northfield Plex") }))
jest.mock("@/lib/setup/status", () => ({ getSetupStatus: jest.fn() }))
jest.mock("next-auth/react", () => ({ signOut: jest.fn() }))
jest.mock("next/navigation", () => ({
  redirect: jest.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT ${url}`)
  }),
  useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }),
}))

const PAGE_DIR = path.join(process.cwd(), "app/auth/denied")

beforeEach(() => {
  mockReset(prismaMock)
  jest.mocked(getSetupStatus).mockResolvedValue({ isComplete: true, currentStepId: 'summary' })
})

describe("/auth/denied", () => {
  it("is a StatusScreen naming the server, with Sign out", async () => {
    prismaMock.discordIntegration.findUnique.mockResolvedValue(null)
    render(await DeniedAccessPage())

    expect(screen.getByTestId("status-screen")).toBeInTheDocument()
    expect(screen.getByTestId("access-denied-heading")).toHaveTextContent("You're not a member of Northfield Plex yet")
    expect(screen.getByText(/Ask the server owner for an invite link/)).toBeInTheDocument()
    expect(screen.getByTestId("denied-sign-out")).toHaveTextContent("Sign out")
    expect(screen.queryByTestId("denied-ask-invite")).not.toBeInTheDocument()
  })

  it("asks for an invite on Discord when an invite code exists, with Sign out second", async () => {
    prismaMock.discordIntegration.findUnique.mockResolvedValue({ serverInviteCode: "north" } as never)
    render(await DeniedAccessPage())

    expect(screen.getByTestId("denied-ask-invite")).toHaveAttribute("href", "https://discord.gg/north")
    expect(screen.getByTestId("denied-sign-out")).toBeInTheDocument()
  })

  it("sends an unfinished install to setup", async () => {
    jest.mocked(getSetupStatus).mockResolvedValue({ isComplete: false, currentStepId: 'plex' })

    await expect(DeniedAccessPage()).rejects.toThrow("NEXT_REDIRECT /setup")
  })

  it("imports no animation library", () => {
    for (const file of fs.readdirSync(PAGE_DIR).filter((name) => name.endsWith(".tsx"))) {
      const source = fs.readFileSync(path.join(PAGE_DIR, file), "utf8")
      expect(source).not.toMatch(/from ["'](?:motion|framer-motion)/)
      expect(source).not.toMatch(/motion-loop|repeat:\s*Infinity/)
    }
  })
})
