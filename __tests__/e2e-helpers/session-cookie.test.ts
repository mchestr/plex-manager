/**
 * @jest-environment node
 */

/**
 * e2e/fixtures/session.ts signs E2E browsers in by minting the NextAuth
 * session cookie (P1.6, P1.5). The app must accept it: next-auth's `decode()`
 * reads the token back with the same secret, and the jwt callback's re-check
 * sees `checkedAt: 0`, so it re-reads the seeded row.
 */

import { decode } from "next-auth/jwt"

import { mintSessionToken, sessionCookieName } from "@/e2e/fixtures/session"

jest.mock("@/e2e/helpers/prisma", () => ({ createE2EPrismaClient: jest.fn() }))

const SECRET = "e2e-session-cookie-test-secret-at-least-32-chars"
const ADMIN = {
  id: "admin-user-id",
  name: "Admin User",
  email: "admin@example.com",
  image: null,
  isAdmin: true,
  sessionVersion: 3,
}

describe("mintSessionToken", () => {
  it("mints a token that decode() from next-auth/jwt accepts", async () => {
    const token = await mintSessionToken(ADMIN, SECRET)

    await expect(decode({ token, secret: SECRET })).resolves.toMatchObject({
      sub: "admin-user-id",
      name: "Admin User",
      email: "admin@example.com",
      picture: null,
      isAdmin: true,
      checkedAt: 0,
      sv: 3,
    })
  })

  it("is refused under another secret", async () => {
    const token = await mintSessionToken(ADMIN, SECRET)

    await expect(decode({ token, secret: `${SECRET}-other` })).rejects.toThrow()
  })
})

describe("sessionCookieName", () => {
  it("uses the __Secure- prefix only on https", () => {
    expect(sessionCookieName("http://localhost:3100")).toBe("next-auth.session-token")
    expect(sessionCookieName("https://rewind.example.com")).toBe("__Secure-next-auth.session-token")
  })
})
