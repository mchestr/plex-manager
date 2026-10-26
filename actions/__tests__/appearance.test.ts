/**
 * @jest-environment node
 *
 * setAppearance (P10.10): a member's Dark or Light choice, kept in the
 * `pm-theme` cookie.
 */

import { getServerSession } from "next-auth"
import { revalidatePath } from "next/cache"

import { setAppearance } from "@/actions/appearance"
import { usesSecureCookies } from "@/lib/env"

const mockSet = jest.fn()
jest.mock("next/headers", () => ({ cookies: async () => ({ set: mockSet }) }))
jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("next-auth", () => ({ getServerSession: jest.fn() }))
jest.mock("@/lib/auth", () => ({ authOptions: {} }))
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }))
jest.mock("@/lib/env", () => ({ usesSecureCookies: jest.fn(() => false) }))

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(getServerSession).mockResolvedValue({ user: { id: "member-1", isAdmin: false } })
})

describe("setAppearance", () => {
  it("refuses a signed-out caller", async () => {
    jest.mocked(getServerSession).mockResolvedValue(null)

    await expect(setAppearance("light")).resolves.toMatchObject({ success: false, code: "UNAUTHENTICATED" })
    expect(mockSet).not.toHaveBeenCalled()
  })

  it.each([["system"], ["LIGHT"], [""]])("refuses %j, which is not Dark or Light", async (value) => {
    // The action's input is typed; a client can still send anything.
    const send = setAppearance as (input: unknown) => ReturnType<typeof setAppearance>

    await expect(send(value)).resolves.toMatchObject({ success: false, code: "VALIDATION" })
    expect(mockSet).not.toHaveBeenCalled()
  })

  it("sets pm-theme for a year on the whole site, HttpOnly and SameSite=Lax", async () => {
    await expect(setAppearance("light")).resolves.toEqual({ success: true, data: { theme: "light" } })

    expect(mockSet).toHaveBeenCalledWith("pm-theme", "light", {
      path: "/",
      sameSite: "lax",
      httpOnly: true,
      secure: false,
      maxAge: 31_536_000,
    })
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout")
  })

  it("marks the cookie Secure where the session cookie is (an https app URL)", async () => {
    jest.mocked(usesSecureCookies).mockReturnValue(true)

    await setAppearance("dark")

    expect(mockSet).toHaveBeenCalledWith("pm-theme", "dark", expect.objectContaining({ secure: true }))
  })
})
