/**
 * `/invite/[code]` (P10.26, UI-36): a Server Component with metadata for
 * unfurls, a voided pass per state, and "Too many attempts" when limited.
 */

import fs from "node:fs"
import path from "node:path"

import { render, screen } from "@testing-library/react"

import InvitePage, { generateMetadata } from "@/app/invite/[code]/page"
import { notFoundInviteCode } from "@/components/status/not-found-screen"
import { getInvitePass, type InvitePassLookup } from "@/lib/invites/pass"
import type { InvitePassData, InviteState } from "@/types/invite"

jest.mock("@/lib/invites/pass", () => ({ getInvitePass: jest.fn() }))
jest.mock("@/components/status/not-found-screen", () => ({ notFoundInviteCode: jest.fn() }))
jest.mock("@/lib/plex-auth", () => ({ startPlexSignIn: jest.fn() }))
jest.mock("@/actions/invite", () => ({ redeemJellyfinInviteForm: jest.fn() }))

const PAGE_DIR = path.join(process.cwd(), "app/invite/[code]")

function pass(state: InviteState): InvitePassData {
  return {
    state,
    code: "NORTH7Q2",
    serverType: "PLEX",
    serverName: "Northfield Plex",
    monogram: "N",
    inviter: "Dana Whitfield",
    libraries: ["All libraries"],
    usesLeft: { left: 1, total: 1 },
    expiresOn: "October 1, 2026",
  }
}

function lookup(value: InvitePassLookup) {
  jest.mocked(getInvitePass).mockResolvedValue(value)
}

const params = Promise.resolve({ code: "NORTH7Q2" })

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(notFoundInviteCode).mockResolvedValue("northfield")
})

describe("/invite/[code] metadata", () => {
  it("unfurls a valid invite as the server's invitation, with no code and no indexing", async () => {
    lookup({ ok: true, pass: pass("valid") })
    const metadata = await generateMetadata({ params })

    expect(metadata.title).toBe("You're invited to Northfield Plex")
    expect(metadata.openGraph?.title).toBe("You're invited to Northfield Plex")
    expect(metadata.robots).toEqual({ index: false, follow: false })
    expect(JSON.stringify(metadata)).not.toContain("NORTH7Q2")
  })

  it.each(["expired", "used-up", "unknown"] as const)("titles a %s invite Invite unavailable", async (state) => {
    lookup({ ok: true, pass: pass(state) })
    const metadata = await generateMetadata({ params })

    expect(metadata.title).toBe("Invite unavailable")
    expect(JSON.stringify(metadata)).not.toContain("NORTH7Q2")
  })

  it("titles a rate-limited lookup Invite unavailable", async () => {
    lookup({ ok: false, code: "RATE_LIMITED" })
    expect((await generateMetadata({ params })).title).toBe("Invite unavailable")
  })
})

describe("/invite/[code] page", () => {
  it("renders the valid pass without asking for the Discord code", async () => {
    lookup({ ok: true, pass: pass("valid") })
    render(await InvitePage({ params }))

    expect(screen.getByTestId("valid-invite-heading")).toBeInTheDocument()
    expect(notFoundInviteCode).not.toHaveBeenCalled()
  })

  it.each([
    ["expired", "This invite has expired"],
    ["used-up", "This invite has no uses left"],
    ["unknown", "We couldn't find that invite"],
  ] as const)("renders the %s copy with Ask on Discord", async (state, title) => {
    lookup({ ok: true, pass: pass(state) })
    render(await InvitePage({ params }))

    expect(screen.getByTestId("invalid-invite-heading")).toHaveTextContent(title)
    expect(screen.getByTestId("invite-ask-discord")).toBeInTheDocument()
  })

  it("renders Too many attempts with the RATE_LIMITED code", async () => {
    lookup({ ok: false, code: "RATE_LIMITED" })
    render(await InvitePage({ params }))

    expect(screen.getByTestId("invite-rate-limited-heading")).toHaveTextContent("Too many attempts")
    expect(screen.getByTestId("status-screen-code")).toHaveTextContent("RATE_LIMITED")
  })

  it("is a Server Component with no client validation", () => {
    const source = fs.readFileSync(path.join(PAGE_DIR, "page.tsx"), "utf8")

    expect(source).not.toMatch(/^\s*["']use client["']/m)
    expect(source).not.toContain("validateInvite")
    expect(source).not.toContain("useEffect")
  })
})
