#!/usr/bin/env tsx
/**
 * `npm run rewind:gallery` (P7.11, design F8): the gallery of the review
 * fixtures, headless, for the pre-freeze review.
 *
 * 1. Signs in as an admin by minting the NextAuth session cookie, as the E2E
 *    fixtures do, so it needs `NEXTAUTH_SECRET` and a `_test` `DATABASE_URL`
 *    shared with the server (a server started for E2E).
 * 2. Opens `/admin/rewind/gallery` on each review fixture, which starts or
 *    reuses its dry run, and reads the pages and cards it lists.
 * 3. Screenshots every page at 390 x 844 and 1440 x 900 and downloads every
 *    card, into `${REWIND_CACHE_DIR}/gallery/<date>/`, with an `index.html`
 *    contact sheet (`scripts/rewind-gallery/plan.ts`).
 *
 * Usage: npm run rewind:gallery -- [--base-url=http://localhost:3000] [--copy=selected|templates]
 *
 * @module scripts/rewind-gallery
 */

import "dotenv/config"

import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"

import { PrismaPg } from "@prisma/adapter-pg"
import { chromium, type BrowserContext } from "@playwright/test"
import { encode } from "next-auth/jwt"

import { PrismaClient } from "../lib/generated/prisma/client"
import { GALLERY_VIEWPORTS, REVIEW_FIXTURE_IDS } from "../lib/rewind/gallery/review"
import { assertTestDatabaseUrl } from "../lib/security/test-mode"

import { contactSheet, galleryPlan, type FixtureSet } from "./rewind-gallery/plan"

const USAGE = "Usage: npm run rewind:gallery -- [--base-url=http://localhost:3000] [--copy=selected|templates]"
/** A dry run can take 90 s; the gallery waits longer before it gives up on a fixture. */
const RUN_TIMEOUT_MS = 300_000

export interface GalleryArgs {
  baseUrl: string
  copy: "selected" | "templates" | null
}

/** The command line, or the reason it is wrong. */
export function parseGalleryArgs(argv: readonly string[]): { ok: true; args: GalleryArgs } | { ok: false; error: string } {
  const args: GalleryArgs = { baseUrl: "http://localhost:3000", copy: null }
  for (const arg of argv) {
    const [key, value] = arg.split(/=(.*)/s, 2)
    if (key === "--base-url" && value) {
      try {
        args.baseUrl = new URL(value).origin
      } catch {
        return { ok: false, error: `--base-url is not a URL: ${value}` }
      }
    } else if (key === "--copy" && (value === "selected" || value === "templates")) {
      args.copy = value
    } else {
      return { ok: false, error: `Unknown argument: ${arg}` }
    }
  }
  return { ok: true, args }
}

/** The session cookie of the first admin, minted the way `e2e/fixtures/session.ts` does. */
async function signInAsAdmin(context: BrowserContext, baseUrl: string) {
  const secret = process.env.NEXTAUTH_SECRET
  if (!secret) throw new Error("NEXTAUTH_SECRET must be set to sign in as an admin")
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: assertTestDatabaseUrl(process.env.DATABASE_URL) }) })
  try {
    const admin = await db.user.findFirst({
      where: { isAdmin: true },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, email: true, image: true, isAdmin: true, sessionVersion: true },
    })
    if (!admin) throw new Error("No admin user in the database")
    const value = await encode({
      secret,
      token: { sub: admin.id, name: admin.name, email: admin.email, picture: admin.image, isAdmin: true, checkedAt: 0, sv: admin.sessionVersion },
    })
    const name = baseUrl.startsWith("https:") ? "__Secure-next-auth.session-token" : "next-auth.session-token"
    await context.addCookies([{ name, value, url: baseUrl, httpOnly: true, sameSite: "Lax" }])
  } finally {
    await db.$disconnect()
  }
}

/** Opens the fixture's tab and waits for its dry run; returns what the tab lists. */
async function readFixture(context: BrowserContext, args: GalleryArgs, fixture: string): Promise<FixtureSet> {
  const page = await context.newPage()
  try {
    const query = new URLSearchParams({ fixture, ...(args.copy && { copy: args.copy }) })
    await page.goto(`${args.baseUrl}/admin/rewind/gallery?${query.toString()}`)
    const outcome = page.getByTestId("rewind-gallery-ready").or(page.getByTestId("rewind-gallery-failed"))
    await outcome.waitFor({ timeout: RUN_TIMEOUT_MS })
    if (await page.getByTestId("rewind-gallery-failed").isVisible()) {
      throw new Error(`${fixture}: ${await page.getByTestId("rewind-gallery-failed").innerText()}`)
    }
    const ready = page.getByTestId("rewind-gallery-ready")
    const previewId = await ready.getAttribute("data-preview-id")
    if (!previewId) throw new Error(`${fixture}: the gallery lists no preview id`)
    const pages = await page.getByTestId("rewind-gallery-page").evaluateAll((items) =>
      items.map((item) => ({ type: item.getAttribute("data-page") ?? "", folio: Number(item.getAttribute("data-folio")) }))
    )
    const cards = await page.getByTestId("rewind-gallery-card").evaluateAll((items) => items.map((item) => item.getAttribute("data-page") ?? ""))
    return { fixture, previewId, pages, cards }
  } finally {
    await page.close()
  }
}

export async function main(argv: readonly string[], print: (line: string) => void = console.log): Promise<number> {
  const parsed = parseGalleryArgs(argv)
  if (!parsed.ok) {
    print(parsed.error)
    print(USAGE)
    return 2
  }
  const { args } = parsed
  const date = new Date().toISOString().slice(0, 10)
  const outDir = path.join(path.resolve(process.env.REWIND_CACHE_DIR ?? ".next/cache/rewind"), "gallery", date)

  const browser = await chromium.launch()
  try {
    const context = await browser.newContext()
    await signInAsAdmin(context, args.baseUrl)
    const sets: FixtureSet[] = []
    for (const fixture of REVIEW_FIXTURE_IDS) {
      print(`${fixture}: waiting for its dry run`)
      sets.push(await readFixture(context, args, fixture))
    }

    const shots = galleryPlan(sets)
    for (const shot of shots) {
      const file = path.join(outDir, shot.file)
      await mkdir(path.dirname(file), { recursive: true })
      if (shot.kind === "card") {
        const response = await context.request.get(`${args.baseUrl}${shot.url}`)
        if (!response.ok()) throw new Error(`${shot.fixture} ${shot.page} card: HTTP ${response.status()}`)
        await writeFile(file, await response.body())
        continue
      }
      const page = await context.newPage()
      try {
        await page.setViewportSize(GALLERY_VIEWPORTS[shot.view])
        await page.goto(`${args.baseUrl}${shot.url}`)
        await page.locator('[data-testid="rewind-stage"][data-fitted]').waitFor()
        await page.waitForLoadState("networkidle")
        await page.screenshot({ path: file })
      } finally {
        await page.close()
      }
    }
    await writeFile(path.join(outDir, "index.html"), contactSheet(shots, date))
    print(`Wrote ${shots.length} files and the contact sheet to ${outDir}`)
    return 0
  } finally {
    await browser.close()
  }
}

if (require.main === module) {
  main(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code
    })
    .catch((error: unknown) => {
      console.error("Rewind gallery failed:", error)
      process.exitCode = 1
    })
}
