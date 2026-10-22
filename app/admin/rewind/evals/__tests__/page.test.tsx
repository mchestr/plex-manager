/**
 * `/admin/rewind/evals` (P11.30): `RewindEvalRun` rows and the committed
 * results files merge into one list, an invalid results file is skipped with a
 * warning, the model `selected.json` names carries its badge, and non-admins
 * get a 404.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

import { render, screen, within } from "@testing-library/react"
import { mockReset } from "jest-mock-extended"
import { notFound } from "next/navigation"

import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { resetUrl } from "@/__tests__/helpers/url-router"
import RewindEvalsPage from "@/app/admin/rewind/evals/page"
import type { EvalResults } from "@/evals/rewind/results-schema"
import { getAdminGate } from "@/lib/admin"
import { Prisma } from "@/lib/generated/prisma/client"

jest.mock("next/navigation", () => ({
  ...require("@/__tests__/helpers/url-router").navigationModule,
  notFound: jest.fn(() => {
    throw new Error("NEXT_NOT_FOUND")
  }),
}))
jest.mock("server-only", () => ({}))
jest.mock("@/lib/admin", () => ({ getAdminGate: jest.fn() }))
jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/components/ui/toast", () => ({ useToast: () => ({ showSuccess: jest.fn(), showError: jest.fn() }) }))
const mockWarn = jest.fn()
jest.mock("@/lib/utils/logger", () => ({ createLogger: () => ({ warn: (...args: unknown[]) => mockWarn(...args), info: jest.fn(), error: jest.fn(), debug: jest.fn() }) }))

function results(model: string, startedAt: string, overrides: Partial<EvalResults> = {}): EvalResults {
  return {
    version: 1,
    model,
    source: "live",
    recordings: null,
    judge: "openai:judge",
    promptVersion: "rewind-2026.1",
    effort: "low",
    startedAt,
    fixtures: [
      {
        id: "heavy",
        edition: "full",
        archetype: "night-owl",
        copySource: "llm",
        calls: 1,
        latencyMs: 12_000,
        costUsd: 0.04,
        slots: 2,
        firstPassFailed: ["intro"],
        afterRepairFailed: [],
        reason: null,
        copy: [{ slot: "intro", origin: "repair", text: "You watched a lot of films." }],
        judge: { scores: { voice: 4, specificity: 4, warmth: 5, restraint: 4, faithfulness: 5 }, mean: 4.4, notes: "Warm" },
      },
    ],
    rates: { firstPass: 0.98, afterRepair: 1 },
    gates: { passed: false, issues: [{ fixture: "heavy", check: "grounding", slot: "intro", message: "Names a film not in the facts" }], archetypes: {}, maxOverlap: null },
    judgeMean: 4.4,
    cost: { estimateUsd: 0.1, generationUsd: 0.04, judgeUsd: 0.05, totalUsd: 0.09 },
    latencyMs: { p50: 12_000, p95: 14_500 },
    ...overrides,
  }
}

let root: string

function writeJson(rel: string, data: unknown) {
  writeFileSync(path.join(root, "evals", "rewind", rel), typeof data === "string" ? data : JSON.stringify(data))
}

function dbRow(id: string, data: EvalResults) {
  return { id, model: data.model, promptVersion: data.promptVersion, fixtures: [], results: data, costUsd: new Prisma.Decimal(0), createdBy: null, createdAt: new Date() }
}

async function renderPage(query: Record<string, string> = {}) {
  render(await RewindEvalsPage({ searchParams: Promise.resolve(query) }))
}

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  resetUrl("/admin/rewind/evals")
  root = mkdtempSync(path.join(tmpdir(), "evals-page-"))
  mkdirSync(path.join(root, "evals", "rewind", "results"), { recursive: true })
  jest.spyOn(process, "cwd").mockReturnValue(root)
  jest.mocked(getAdminGate).mockResolvedValue({ ok: true, session: { user: { id: "admin-1", isAdmin: true } } } as never)
  writeJson("selected.json", { model: "anthropic:alpha", promptVersion: "rewind-2026.1" })
})

afterEach(() => {
  jest.restoreAllMocks()
  rmSync(root, { recursive: true, force: true })
})

it("refuses non-admins", async () => {
  jest.mocked(getAdminGate).mockResolvedValue({ ok: false, reason: "forbidden" })
  await expect(renderPage()).rejects.toThrow("NEXT_NOT_FOUND")
  expect(notFound).toHaveBeenCalled()
  expect(prismaMock.rewindEvalRun.findMany).not.toHaveBeenCalled()
})

it("merges database rows with the committed results files, one row per run", async () => {
  const shared = results("anthropic:alpha", "2026-11-18T10:00:00.000Z")
  prismaMock.rewindEvalRun.findMany.mockResolvedValue([dbRow("run-db-1", shared), dbRow("run-db-2", results("openai:beta", "2026-11-19T10:00:00.000Z"))])
  writeJson("results/2026-11-18-anthropic-alpha.json", shared)
  writeJson("results/2026-11-20-google-gamma.json", results("google:gamma", "2026-11-20T10:00:00.000Z", { rates: { firstPass: 0.9, afterRepair: 0.95 } }))

  await renderPage()

  const table = screen.getByRole("table", { name: "Eval runs" })
  const models = within(table).getAllByTestId(/^admin-evals-open-/).map((el) => el.textContent)
  expect(models).toEqual(["google:gamma", "openai:beta", "anthropic:alpha"])
  expect(screen.getByTestId("admin-evals-open-run-db-1")).toBeInTheDocument()
  expect(screen.getByTestId("admin-evals-open-2026-11-20-google-gamma")).toBeInTheDocument()
  expect(within(table).getByText("90.0%")).toBeInTheDocument()
  expect(within(table).getAllByText("14.5 s")).toHaveLength(3)
  expect(screen.getByTestId("admin-evals-command")).toHaveTextContent("npm run eval:rewind")
})

it("skips an invalid results file with a warning", async () => {
  prismaMock.rewindEvalRun.findMany.mockResolvedValue([])
  writeJson("results/2026-11-18-anthropic-alpha.json", results("anthropic:alpha", "2026-11-18T10:00:00.000Z"))
  writeJson("results/broken.json", { version: 2, model: "x" })
  writeJson("results/not-json.json", "{")

  await renderPage()

  expect(screen.getAllByTestId(/^admin-evals-open-/)).toHaveLength(1)
  expect(screen.getByTestId("admin-evals-skipped")).toHaveTextContent("broken.json, not-json.json")
  expect(mockWarn).toHaveBeenCalledWith("Skipped an invalid eval results file", { fileName: "broken.json" })
})

it("badges the selected model only", async () => {
  prismaMock.rewindEvalRun.findMany.mockResolvedValue([
    dbRow("alpha", results("anthropic:alpha", "2026-11-18T10:00:00.000Z")),
    dbRow("beta", results("openai:beta", "2026-11-19T10:00:00.000Z")),
  ])

  await renderPage()

  expect(screen.getByTestId("admin-evals-selected-alpha")).toHaveTextContent("Selected")
  expect(screen.queryByTestId("admin-evals-selected-beta")).not.toBeInTheDocument()
  expect(screen.getByTestId("admin-evals-header")).toHaveTextContent("The selected model is anthropic:alpha.")
})

it("offers the CLI command, not a Run button, when there are no runs", async () => {
  prismaMock.rewindEvalRun.findMany.mockResolvedValue([])
  await renderPage()
  expect(screen.getByTestId("admin-evals-empty")).toBeInTheDocument()
  expect(screen.queryByRole("button", { name: /^run/i })).not.toBeInTheDocument()
})
