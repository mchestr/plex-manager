/**
 * @jest-environment node
 */

/**
 * The read-only media cleanup preview actions (TS 10.2): admin only, the
 * per-admin `admin:cleanup-preview` limit, Zod input, the 10 s timeout of
 * `previewCleanupRule`, the audit of requester names, and no error text.
 */

import { getServerSession } from "next-auth"

import { getCleanupItemWhy, previewCleanupProtectionImpact, previewCleanupRecipe, previewCleanupRule } from "@/actions/admin/cleanup-preview"
import { runProtectionImpact } from "@/lib/cleanup/preview/protection-impact"
import { runRecipePreview } from "@/lib/cleanup/preview/recipe-preview"
import { runPreview } from "@/lib/cleanup/preview/run-preview"
import { getWhySheet } from "@/lib/cleanup/preview/why-sheet"
import type { PreviewResponse, RecipePreview, WhySheetData } from "@/lib/cleanup/types/preview"
import { auditMemberListed } from "@/lib/security/audit-log"
import { consume } from "@/lib/security/rate-limit"
import { protectionsOptionsSchema } from "@/lib/validations/cleanup-options"

jest.mock("next-auth", () => ({ getServerSession: jest.fn() }))
jest.mock("@/lib/auth", () => ({ authOptions: {} }))
jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/security/rate-limit", () => ({ consume: jest.fn(), actionClientIp: jest.fn() }))
jest.mock("@/lib/security/audit-log", () => ({ auditMemberListed: jest.fn() }))
jest.mock("@/lib/cleanup/preview/run-preview", () => ({ runPreview: jest.fn() }))
jest.mock("@/lib/cleanup/preview/recipe-preview", () => ({ runRecipePreview: jest.fn() }))
jest.mock("@/lib/cleanup/preview/protection-impact", () => ({ runProtectionImpact: jest.fn() }))
jest.mock("@/lib/cleanup/preview/why-sheet", () => ({ getWhySheet: jest.fn() }))
jest.mock("@/lib/utils/logger", () => ({ createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }) }))

const ADMIN = { user: { id: "admin-1", isAdmin: true }, expires: "" }
const DEFINITION = {
  schemaVersion: 1 as const, level: "movie" as const, libraries: ["1"], protections: [],
  conditions: [{ id: "c1", field: "watch.lastPlayed" as const, op: "never", value: { duration: { amount: 365, unit: "days" }, orNever: true } }],
  then: { graceDays: 30, action: "movie.delete" as const, importListExclusion: true },
}
const PREVIEW = { rows: [], matches: 3 } as unknown as PreviewResponse
const RECIPE = { recipeId: "never-watched-movies", matches: 2 } as unknown as RecipePreview
const WHY = { state: "match" } as unknown as WhySheetData
const IMPACT = { rules: [], protects: { g4: 2 }, leaves: 0 }
const PROTECTIONS = protectionsOptionsSchema.parse({})

const CALLS = [
  ["previewCleanupRule", () => previewCleanupRule({ definition: DEFINITION })],
  ["previewCleanupRecipe", () => previewCleanupRecipe({ recipeId: "never-watched-movies", values: {} })],
  ["previewCleanupProtectionImpact", () => previewCleanupProtectionImpact({ protections: PROTECTIONS })],
  ["getCleanupItemWhy", () => getCleanupItemWhy({ itemKey: "movie:tmdb:1001", ruleId: "rule-1" })],
] as const

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(getServerSession).mockResolvedValue(ADMIN)
  jest.mocked(consume).mockResolvedValue({ ok: true, remaining: 100 } as never)
  jest.mocked(runPreview).mockResolvedValue(PREVIEW)
  jest.mocked(runRecipePreview).mockResolvedValue({ ok: true, data: RECIPE })
  jest.mocked(runProtectionImpact).mockResolvedValue(IMPACT)
  jest.mocked(getWhySheet).mockResolvedValue(WHY)
})

describe("refused callers and the limit", () => {
  it.each(CALLS)("%s refuses a signed-out caller and a member", async (_name, call) => {
    jest.mocked(getServerSession).mockResolvedValueOnce(null)
    await expect(call()).resolves.toMatchObject({ success: false, code: "UNAUTHENTICATED" })
    jest.mocked(getServerSession).mockResolvedValueOnce({ user: { id: "member-1", isAdmin: false }, expires: "" })
    await expect(call()).resolves.toMatchObject({ success: false, code: "FORBIDDEN" })
    expect(consume).not.toHaveBeenCalled()
  })

  it.each(CALLS)("%s spends the admin's preview limit and stops at it", async (_name, call) => {
    await call()
    expect(consume).toHaveBeenCalledWith("admin:cleanup-preview", "admin-1")
    jest.mocked(consume).mockResolvedValueOnce({ ok: false, retryAfterSec: 30 } as never)
    await expect(call()).resolves.toMatchObject({ success: false, code: "RATE_LIMITED", retryAfterSec: 30 })
  })
})

describe("validation", () => {
  it.each([
    ["previewCleanupRule", () => previewCleanupRule({ definition: { ...DEFINITION, level: "episode" } } as never)],
    ["previewCleanupRecipe", () => previewCleanupRecipe({ recipeId: "no-such-recipe", values: {} } as never)],
    ["previewCleanupProtectionImpact", () => previewCleanupProtectionImpact({ protections: { g4: { days: 0 } } } as never)],
    ["getCleanupItemWhy", () => getCleanupItemWhy({ itemKey: "not a key" })],
  ])("%s refuses a bad input before any work", async (_name, call) => {
    await expect(call()).resolves.toMatchObject({ success: false, code: "VALIDATION" })
    expect(runPreview).not.toHaveBeenCalled()
    expect(runRecipePreview).not.toHaveBeenCalled()
    expect(runProtectionImpact).not.toHaveBeenCalled()
    expect(getWhySheet).not.toHaveBeenCalled()
  })

  it("refuses recipe values that the recipe's own schema refuses", async () => {
    jest.mocked(runRecipePreview).mockResolvedValueOnce({ ok: false, error: { issues: [{ message: "Invalid input" }] } as never })
    await expect(previewCleanupRecipe({ recipeId: "never-watched-movies", values: { added: "x" } })).resolves.toEqual({
      success: false, code: "VALIDATION", error: "Invalid input" })
    jest.mocked(runRecipePreview).mockResolvedValueOnce({ ok: false, error: { issues: [] } as never })
    await expect(previewCleanupRecipe({ recipeId: "never-watched-movies", values: {} })).resolves.toMatchObject({ error: "Check the recipe values." })
  })
})

describe("success", () => {
  it("previews a rule with a 10 s signal, and audits rows with requesters", async () => {
    await expect(previewCleanupRule({ definition: DEFINITION, ruleId: "rule-1" })).resolves.toEqual({ success: true, data: PREVIEW })
    const [request, options] = jest.mocked(runPreview).mock.calls[0]
    expect(request).toMatchObject({ ruleId: "rule-1", tab: "matches", page: 1 })
    expect(options).toMatchObject({ actorId: "admin-1" })
    expect(options.signal).toBeInstanceOf(AbortSignal)
    expect(auditMemberListed).not.toHaveBeenCalled()
    jest.mocked(runPreview).mockResolvedValueOnce({ rows: [{ requestedBy: [{ name: "Avery Example", status: "member", at: "x" }] }] } as unknown as PreviewResponse)
    await previewCleanupRule({ definition: DEFINITION, ruleId: "rule-1" })
    expect(auditMemberListed).toHaveBeenCalledWith("cleanup-requesters", "admin-1", { ruleId: "rule-1" })
    jest.mocked(runPreview).mockResolvedValueOnce({ rows: [{ requestedBy: [{ name: "Avery Example", status: "member", at: "x" }] }] } as unknown as PreviewResponse)
    await previewCleanupRule({ definition: DEFINITION })
    expect(auditMemberListed).toHaveBeenLastCalledWith("cleanup-requesters", "admin-1", {})
  })

  it("previews a recipe and a protection change", async () => {
    await expect(previewCleanupRecipe({ recipeId: "never-watched-movies", level: "movie", values: { added: "365d" } })).resolves.toEqual({ success: true, data: RECIPE })
    expect(runRecipePreview).toHaveBeenCalledWith({ recipeId: "never-watched-movies", level: "movie", values: { added: "365d" } })
    await expect(previewCleanupProtectionImpact({ protections: PROTECTIONS })).resolves.toEqual({ success: true, data: IMPACT })
  })

  it("explains a title, audits it, and answers NOT_FOUND for a title it cannot explain", async () => {
    await expect(getCleanupItemWhy({ itemKey: "movie:tmdb:1001", ruleId: "rule-1" })).resolves.toEqual({ success: true, data: WHY })
    expect(auditMemberListed).toHaveBeenCalledWith("cleanup-requesters", "admin-1", { ruleId: "rule-1" })
    await getCleanupItemWhy({ itemKey: "movie:tmdb:1001", outcomeId: "o-1" })
    expect(auditMemberListed).toHaveBeenLastCalledWith("cleanup-requesters", "admin-1", {})
    jest.mocked(getWhySheet).mockResolvedValueOnce(null)
    await expect(getCleanupItemWhy({ itemKey: "movie:tmdb:1001" })).resolves.toMatchObject({ success: false, code: "NOT_FOUND" })
  })
})

describe("the timeout and errors", () => {
  it("answers a preview that ran past 10 s with a safe failure", async () => {
    const timedOut = AbortSignal.abort(new DOMException("The operation timed out.", "TimeoutError"))
    const timeout = jest.spyOn(AbortSignal, "timeout").mockReturnValue(timedOut)
    jest.mocked(runPreview).mockImplementationOnce(async (_request, { signal }) => {
      signal?.throwIfAborted()
      return PREVIEW
    })
    await expect(previewCleanupRule({ definition: DEFINITION })).resolves.toEqual({ success: false, code: "INTERNAL", error: "The preview took too long. Try again." })
    expect(timeout).toHaveBeenCalledWith(10_000)
    timeout.mockRestore()
  })

  it.each(CALLS)("%s never returns the error text", async (_name, call) => {
    const leak = new Error("connection to db.internal:5432 refused")
    jest.mocked(runPreview).mockRejectedValueOnce(leak)
    jest.mocked(runRecipePreview).mockRejectedValueOnce(leak)
    jest.mocked(runProtectionImpact).mockRejectedValueOnce(leak)
    jest.mocked(getWhySheet).mockRejectedValueOnce(leak)
    const result = await call()
    expect(result).toMatchObject({ success: false, code: "INTERNAL" })
    expect(JSON.stringify(result)).not.toContain("db.internal")
  })
})
