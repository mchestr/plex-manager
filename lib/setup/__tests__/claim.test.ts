/**
 * @jest-environment node
 */

/**
 * lib/setup/claim.ts (P11.32, SEC-30): the setup code, its single use, the
 * SETUP_TOKEN override and the claim cookie.
 */

import crypto, { createHash } from "node:crypto"

import { mockReset } from "jest-mock-extended"

import { buildSetup } from "@/__tests__/helpers/factories"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import {
  generateSetupCode,
  issueSetupCode,
  redeemSetupCode,
  requireSetupClaim,
  setupClaimCookie,
} from "@/lib/setup/claim"
import { signValue } from "@/lib/security/signed-cookie"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)

const jar = new Map<string, string>()
jest.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
    delete: (name: string) => jar.delete(name),
  }),
}))

const SETUP_CLAIM_COOKIE = "pm-setup"
const CODE_FORMAT = /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex")

beforeEach(() => {
  mockReset(prismaMock)
  jar.clear()
  delete process.env.SETUP_TOKEN
  prismaMock.setup.updateMany.mockResolvedValue({ count: 1 })
})

afterEach(() => {
  jest.restoreAllMocks()
  jest.useRealTimers()
})

/** Issues a code against an incomplete wizard row and returns it with the stored hash. */
async function issue(): Promise<{ code: string; hash: string }> {
  prismaMock.setup.findFirst.mockResolvedValue(buildSetup({ id: "setup-1" }))
  const write = jest.spyOn(process.stdout, "write").mockImplementation(() => true)
  await issueSetupCode()
  const banner = String(write.mock.calls[0]?.[0])
  const code = banner.replace("Setup code: ", "").trim()
  const { data } = prismaMock.setup.update.mock.calls[0][0]
  return { code, hash: data.claimCodeHash as string }
}

describe("issueSetupCode", () => {
  it("prints a code in the right format and stores only its hash", async () => {
    const { code, hash } = await issue()

    expect(code).toMatch(CODE_FORMAT)
    expect(hash).toBe(sha256(code.replaceAll("-", "")))
    expect(JSON.stringify(prismaMock.setup.update.mock.calls)).not.toContain(code.replaceAll("-", ""))
  })

  it("creates the wizard row when there is none yet", async () => {
    prismaMock.setup.findFirst.mockResolvedValue(null)
    jest.spyOn(process.stdout, "write").mockImplementation(() => true)

    await issueSetupCode()

    expect(prismaMock.setup.create).toHaveBeenCalledWith({
      data: { claimCodeHash: expect.stringMatching(/^[0-9a-f]{64}$/), claimCodeIssuedAt: expect.any(Date) },
    })
  })

  it("issues nothing once setup is complete, or while SETUP_TOKEN is set", async () => {
    const write = jest.spyOn(process.stdout, "write").mockImplementation(() => true)
    prismaMock.setup.findFirst.mockResolvedValue(buildSetup({ isComplete: true }))
    await issueSetupCode()

    process.env.SETUP_TOKEN = "a-long-enough-setup-token"
    prismaMock.setup.findFirst.mockResolvedValue(buildSetup())
    await issueSetupCode()

    // The logger may also write to stdout; what must never appear is a code
    expect(write).not.toHaveBeenCalledWith(expect.stringContaining("Setup code:"))
    expect(prismaMock.setup.update).not.toHaveBeenCalled()
  })

  it("uses only the setup alphabet", () => {
    for (let i = 0; i < 50; i++) expect(generateSetupCode()).toMatch(CODE_FORMAT)
  })
})

describe("redeemSetupCode", () => {
  it("refuses a wrong code", async () => {
    const { hash } = await issue()
    prismaMock.setup.findFirst.mockResolvedValue(buildSetup({ id: "setup-1", claimCodeHash: hash }))

    await expect(redeemSetupCode("AAAA-AAAA-AAAA")).resolves.toEqual({ ok: false })
    expect(prismaMock.setup.updateMany).not.toHaveBeenCalled()
  })

  it("accepts the code in lower case with spaces, once", async () => {
    const { code, hash } = await issue()
    prismaMock.setup.findFirst.mockResolvedValue(buildSetup({ id: "setup-1", claimCodeHash: hash }))

    const typed = ` ${code.toLowerCase().replaceAll("-", " ")} `
    const first = await redeemSetupCode(typed)

    expect(first).toEqual({ ok: true, claimId: expect.any(String), method: "code" })
    expect(prismaMock.setup.updateMany).toHaveBeenCalledWith({
      where: { id: "setup-1", claimCodeHash: hash },
      data: { claimId: expect.any(String), claimedAt: expect.any(Date), claimCodeHash: null },
    })

    // The use cleared the hash
    prismaMock.setup.findFirst.mockResolvedValue(buildSetup({ id: "setup-1", claimCodeHash: null }))
    await expect(redeemSetupCode(code)).resolves.toEqual({ ok: false })
  })

  it("lets only one of two racing uses of a code claim", async () => {
    const { code, hash } = await issue()
    prismaMock.setup.findFirst.mockResolvedValue(buildSetup({ id: "setup-1", claimCodeHash: hash }))
    prismaMock.setup.updateMany.mockResolvedValue({ count: 0 })

    await expect(redeemSetupCode(code)).resolves.toEqual({ ok: false })
  })

  it("accepts SETUP_TOKEN instead of a code, and compares with timingSafeEqual", async () => {
    process.env.SETUP_TOKEN = "a-long-enough-setup-token"
    prismaMock.setup.findFirst.mockResolvedValue(null)
    const compare = jest.spyOn(crypto, "timingSafeEqual")

    await expect(redeemSetupCode("not-the-token-at-all")).resolves.toEqual({ ok: false })
    await expect(redeemSetupCode("a-long-enough-setup-token")).resolves.toMatchObject({ ok: true, method: "token" })

    expect(compare).toHaveBeenCalledTimes(2)
    expect(prismaMock.setup.create).toHaveBeenCalledWith({
      data: { claimId: expect.any(String), claimedAt: expect.any(Date), claimCodeHash: null },
    })
  })

  it("ignores a SETUP_TOKEN shorter than 16 characters", async () => {
    process.env.SETUP_TOKEN = "too-short"
    prismaMock.setup.findFirst.mockResolvedValue(buildSetup({ claimCodeHash: null }))

    await expect(redeemSetupCode("too-short")).resolves.toEqual({ ok: false })
  })
})

describe("requireSetupClaim", () => {
  const claimed = buildSetup({ claimId: "claim-1" })

  it("accepts the cookie of the current claim", async () => {
    prismaMock.setup.findFirst.mockResolvedValue(claimed)
    jar.set(SETUP_CLAIM_COOKIE, setupClaimCookie("claim-1").value)

    await expect(requireSetupClaim()).resolves.toEqual({ ok: true })
  })

  it("refuses no cookie, an older claim, or a completed setup", async () => {
    prismaMock.setup.findFirst.mockResolvedValue(claimed)
    await expect(requireSetupClaim()).resolves.toEqual({ ok: false, code: "SETUP_UNCLAIMED" })

    jar.set(SETUP_CLAIM_COOKIE, setupClaimCookie("claim-0").value)
    await expect(requireSetupClaim()).resolves.toEqual({ ok: false, code: "SETUP_UNCLAIMED" })

    jar.set(SETUP_CLAIM_COOKIE, setupClaimCookie("claim-1").value)
    prismaMock.setup.findFirst.mockResolvedValue(buildSetup({ claimId: "claim-1", isComplete: true }))
    await expect(requireSetupClaim()).resolves.toEqual({ ok: false, code: "SETUP_UNCLAIMED" })
  })

  it("refuses a tampered cookie, or one signed for another purpose", async () => {
    prismaMock.setup.findFirst.mockResolvedValue(claimed)
    const [body, signature] = setupClaimCookie("claim-1").value.split(".")
    const forged = Buffer.from(JSON.stringify({ claimId: "claim-1", exp: 9_999_999_999 })).toString("base64url")

    jar.set(SETUP_CLAIM_COOKIE, `${forged}.${signature}`)
    await expect(requireSetupClaim()).resolves.toMatchObject({ ok: false })

    jar.set(SETUP_CLAIM_COOKIE, `${body}.${signature.startsWith("A") ? "B" : "A"}${signature.slice(1)}`)
    await expect(requireSetupClaim()).resolves.toMatchObject({ ok: false })

    jar.set(SETUP_CLAIM_COOKIE, signValue({ claimId: "claim-1" }, "plex-pin", 900))
    await expect(requireSetupClaim()).resolves.toMatchObject({ ok: false })
  })

  it("refuses an expired cookie after 12 hours", async () => {
    jest.useFakeTimers({ now: new Date("2027-01-20T08:00:00Z") })
    prismaMock.setup.findFirst.mockResolvedValue(claimed)
    jar.set(SETUP_CLAIM_COOKIE, setupClaimCookie("claim-1").value)

    jest.setSystemTime(new Date("2027-01-20T19:59:59Z"))
    await expect(requireSetupClaim()).resolves.toEqual({ ok: true })

    jest.setSystemTime(new Date("2027-01-20T20:00:00Z"))
    await expect(requireSetupClaim()).resolves.toEqual({ ok: false, code: "SETUP_UNCLAIMED" })
  })
})

describe("setupClaimCookie", () => {
  it("is httpOnly, SameSite=Lax, site-wide and lasts 12 hours", () => {
    expect(setupClaimCookie("claim-1")).toMatchObject({
      name: "pm-setup",
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 43200,
    })
  })
})
