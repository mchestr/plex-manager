/**
 * The server zone's fallback chain (P2.2): Config.timezone, then a valid TZ,
 * then UTC.
 */

import { prisma } from "@/lib/prisma"
import { serverZone } from "@/lib/utils/server-zone"

jest.mock("@/lib/prisma", () => ({
  prisma: { config: { findUnique: jest.fn() } },
}))

const findUnique = prisma.config.findUnique as jest.Mock

describe("serverZone", () => {
  const originalTz = process.env.TZ

  afterEach(() => {
    process.env.TZ = originalTz
  })

  it("uses Config.timezone first", async () => {
    findUnique.mockResolvedValue({ timezone: "America/Chicago" })
    process.env.TZ = "Europe/Berlin"
    await expect(serverZone()).resolves.toBe("America/Chicago")
    expect(findUnique).toHaveBeenCalledWith({ where: { id: "config" }, select: { timezone: true } })
  })

  it.each([
    ["no config row", null],
    ["no zone set", { timezone: null }],
    ["an invalid stored zone", { timezone: "Mars/Base" }],
  ])("falls back to a valid TZ with %s", async (_label, row) => {
    findUnique.mockResolvedValue(row)
    process.env.TZ = "US/Pacific"
    await expect(serverZone()).resolves.toBe("America/Los_Angeles")
  })

  it.each([undefined, "", ":/etc/localtime", "Mars/Base"])("falls back to UTC when TZ is %p", async (tz) => {
    findUnique.mockResolvedValue({ timezone: null })
    if (tz === undefined) delete process.env.TZ
    else process.env.TZ = tz
    await expect(serverZone()).resolves.toBe("UTC")
  })
})
