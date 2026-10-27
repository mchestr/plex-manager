/**
 * @jest-environment node
 *
 * playwright.config.ts must refuse a non-test E2E_DATABASE_URL while it loads,
 * before global setup or the web server can connect, and must point every
 * process at the test database.
 */

import type { PlaywrightTestConfig } from "@playwright/test"

// dotenv would load the developer's .env; @playwright/test only needs to hand
// the config object back.
jest.mock("dotenv/config", () => ({}))
jest.mock("@playwright/test", () => ({
  defineConfig: (config: unknown) => config,
  devices: { "Desktop Chrome": {} },
}))

const TEST_URL = "postgresql://postgres:pw@localhost:5433/plex_manager_test?schema=public"
const DEV_URL = "postgresql://postgres:pw@localhost:5432/plex_wrapped?schema=public"

const env = process.env as Record<string, string | undefined>
const originalEnv = { ...process.env }

function loadConfig(): PlaywrightTestConfig {
  let config: PlaywrightTestConfig | undefined
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    config = require("../../playwright.config").default
  })
  if (!config) throw new Error("playwright.config.ts did not export a config")
  return config
}

function webServerEnv(config: PlaywrightTestConfig): Record<string, string> {
  const webServer = config.webServer
  if (!webServer || Array.isArray(webServer)) throw new Error("expected a single webServer")
  return webServer.env ?? {}
}

describe("playwright.config.ts database guard", () => {
  beforeEach(() => {
    jest.spyOn(console, "log").mockImplementation(() => {})
    env.DATABASE_URL = DEV_URL
    delete env.E2E_DATABASE_URL
    delete env.E2E_PORT
    delete env.E2E_REUSE_SERVER
    delete env.E2E_SERVER
    delete env.E2E_PREBUILT
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  afterAll(() => {
    process.env = originalEnv
  })

  it("refuses to load when E2E_DATABASE_URL is unset, leaving DATABASE_URL alone", () => {
    expect(() => loadConfig()).toThrow(/no database URL is set/)
    expect(env.DATABASE_URL).toBe(DEV_URL)
  })

  it.each([
    ["the development database", DEV_URL],
    ["the old CI name test_db", "postgresql://postgres:pw@localhost:5432/test_db"],
  ])("refuses to load with %s", (_label, url) => {
    env.E2E_DATABASE_URL = url

    expect(() => loadConfig()).toThrow(/must end in _test/)
    expect(env.DATABASE_URL).toBe(DEV_URL)
  })

  it("points DATABASE_URL and the web server at the test database", () => {
    env.E2E_DATABASE_URL = TEST_URL

    const config = loadConfig()
    const serverEnv = webServerEnv(config)

    expect(env.DATABASE_URL).toBe(TEST_URL)
    expect(serverEnv.DATABASE_URL).toBe(TEST_URL)
    expect(serverEnv.E2E_TEST_MODE).toBe("true")
    expect(serverEnv.NEXTAUTH_URL).toBe("http://localhost:3100")
    expect(config.use?.baseURL).toBe("http://localhost:3100")
  })

  it("reuses a running server only with E2E_REUSE_SERVER=1", () => {
    env.E2E_DATABASE_URL = TEST_URL
    const webServer = (config: PlaywrightTestConfig) =>
      Array.isArray(config.webServer) ? undefined : config.webServer

    expect(webServer(loadConfig())?.reuseExistingServer).toBe(false)

    env.E2E_REUSE_SERVER = "1"
    expect(webServer(loadConfig())?.reuseExistingServer).toBe(true)
  })

  it("serves a production build only with E2E_SERVER=prod", () => {
    env.E2E_DATABASE_URL = TEST_URL
    const webServer = (config: PlaywrightTestConfig) =>
      Array.isArray(config.webServer) ? undefined : config.webServer

    const dev = webServer(loadConfig())
    expect(dev?.command).toBe("npx next dev -p 3100")
    expect(dev?.env?.NODE_ENV).toBe("test")

    env.E2E_SERVER = "prod"
    const prod = webServer(loadConfig())
    expect(prod?.command).toBe("npm run build:e2e && npx next start -p 3100")
    expect(prod?.env?.NODE_ENV).toBe("production")

    env.E2E_PREBUILT = "1"
    expect(webServer(loadConfig())?.command).toBe("npx next start -p 3100")
  })

  it("keeps the visual specs out of the chromium project", () => {
    env.E2E_DATABASE_URL = TEST_URL
    const projects = loadConfig().projects ?? []
    const chromium = projects.find((project) => project.name === "chromium")
    const ignored = [chromium?.testIgnore].flat() as RegExp[]

    expect(ignored.some((pattern) => pattern.test("e2e/visual/member.visual.spec.ts"))).toBe(true)
    expect(projects.map((project) => project.name)).toEqual(
      expect.arrayContaining(["visual-desktop", "visual-mobile", "visual-setup-desktop", "visual-setup-mobile"])
    )
  })

  it("gives each Rewind spec folder to its own projects only (P5.4)", () => {
    env.E2E_DATABASE_URL = TEST_URL
    const projects = loadConfig().projects ?? []
    const matches = (pattern: unknown, file: string) => [pattern].flat().some((p) => p instanceof RegExp && p.test(file))
    const owners = (file: string) =>
      projects
        .filter((project) => (project.testMatch ? matches(project.testMatch, file) : !matches(project.testIgnore, file)))
        .map((project) => project.name)
        .sort()

    expect(owners("/repo/e2e/visual/rewind.spec.ts")).toEqual([
      "rewind-visual-desktop-chromium",
      "rewind-visual-desktop-webkit",
      "rewind-visual-phone-chromium",
      "rewind-visual-phone-webkit",
      // P10.10: the light theme compared with the dark Rewind baselines
      "visual-light-rewind",
    ])
    expect(owners("/repo/e2e/a11y/rewind.a11y.spec.ts")).toEqual(["rewind-a11y-chromium", "rewind-a11y-firefox", "rewind-a11y-webkit"])
    expect(owners("/repo/e2e/perf/rewind.perf.spec.ts")).toEqual(["rewind-perf"])
    expect(owners("/repo/e2e/rewind/story.spec.ts")).toEqual(["rewind-e2e-chromium", "rewind-e2e-webkit"])
    expect(owners("/repo/e2e/rewind-routes.spec.ts")).toEqual(["chromium"])
    expect(projects.find((project) => project.name === "rewind-a11y-firefox")?.grep).toEqual(/@article/)
  })

  it("runs the light projects with the light cookie (P10.10)", () => {
    env.E2E_DATABASE_URL = TEST_URL
    const projects = loadConfig().projects ?? []
    const byName = (name: string) => projects.find((project) => project.name === name)

    for (const name of ["visual-light-desktop", "visual-light-mobile", "visual-light-rewind", "a11y-light"]) {
      const project = byName(name)
      expect(project?.dependencies).toBeUndefined()
      expect(project?.use?.storageState).toEqual({
        cookies: [expect.objectContaining({ name: "pm-theme", value: "light", path: "/" })],
        origins: [],
      })
    }
    expect(byName("visual-light-rewind")?.snapshotPathTemplate).toContain("/rewind-visual-phone-chromium/")
  })
})
