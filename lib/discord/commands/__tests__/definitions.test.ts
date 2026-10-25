/**
 * @jest-environment node
 */

// GAP-13: registration imports the definitions without a database, so they
// (and the registry, whose handlers load lazily) must never load Prisma.

let mockPrismaLoaded = false
jest.mock("@/lib/prisma", () => {
  mockPrismaLoaded = true
  return { prisma: {} }
})

const originalDatabaseUrl = process.env.DATABASE_URL

afterAll(() => {
  if (originalDatabaseUrl !== undefined) process.env.DATABASE_URL = originalDatabaseUrl
})

describe("COMMAND_DEFINITIONS", () => {
  it("imports without DATABASE_URL and never loads @/lib/prisma, nor does the registry", async () => {
    delete process.env.DATABASE_URL

    const { COMMAND_DEFINITIONS } = await import("@/lib/discord/commands/definitions")
    const { COMMANDS } = await import("@/lib/discord/commands/registry")

    expect(Object.keys(COMMAND_DEFINITIONS).length).toBeGreaterThan(0)
    expect(COMMANDS.length).toBeGreaterThan(0)
    expect(mockPrismaLoaded).toBe(false)
  })

  it("names the same commands as the registry, in the same order", async () => {
    const { COMMAND_DEFINITIONS } = await import("@/lib/discord/commands/definitions")
    const { COMMANDS } = await import("@/lib/discord/commands/registry")

    expect(COMMANDS.map((entry) => entry.name)).toEqual(Object.keys(COMMAND_DEFINITIONS))
    for (const entry of COMMANDS) {
      const definition = COMMAND_DEFINITIONS[entry.name]
      expect(definition.name).toBe(entry.name)
      // Each lazily loaded handler registers the shared definition itself.
      expect((await entry.load()).data).toBe(definition)
    }
  })
})
