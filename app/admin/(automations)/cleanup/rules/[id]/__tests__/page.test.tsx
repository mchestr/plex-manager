/**
 * The rule editor page (UX 4.3, TS 12.2): its own admin check before any
 * read, the not-found page for an id that cannot be a rule id (before any
 * read) and for a missing rule, and the editor with the loader's data, the
 * render clock and the job queue state.
 */

import { isValidElement, type ReactElement } from "react"

import CleanupRulePage from "@/app/admin/(automations)/cleanup/rules/[id]/page"
import type { RuleEditorProps } from "@/components/admin/cleanup/editor/rule-editor"
import { assertAdmin } from "@/lib/admin"
import { getCleanupRuleEditor } from "@/lib/data/cleanup-editor"

jest.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND")
  },
}))
jest.mock("next/server", () => ({ connection: jest.fn().mockResolvedValue(undefined) }))
jest.mock("@/lib/admin", () => ({ assertAdmin: jest.fn() }))
jest.mock("@/lib/data/cleanup-editor", () => ({ getCleanupRuleEditor: jest.fn() }))
jest.mock("@/lib/queue/connection", () => ({ isRedisConfigured: () => true }))
jest.mock("@/components/admin/cleanup/editor/rule-editor", () => ({ RuleEditor: () => null }))

const loader = getCleanupRuleEditor as jest.Mock
const DATA = { rule: { id: "rule-1" } }

async function open(id: string) {
  const element = await CleanupRulePage({ params: Promise.resolve({ id }) })
  if (!isValidElement(element)) throw new Error("no element")
  return element as ReactElement<RuleEditorProps>
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe("the rule editor page", () => {
  it("checks the admin, loads the rule and renders the editor", async () => {
    const order: string[] = []
    ;(assertAdmin as jest.Mock).mockImplementation(async () => order.push("admin"))
    loader.mockImplementation(async () => {
      order.push("load")
      return DATA
    })
    const element = await open("rule-1")
    expect(order).toEqual(["admin", "load"])
    expect(loader).toHaveBeenCalledWith({ ruleId: "rule-1" }, expect.any(Date))
    expect(element.props).toMatchObject({ data: DATA, redis: true, now: expect.any(Number) })
  })

  it.each(["has space", "a".repeat(41), "dots.in.it"])("shows the not-found page for the id %s, before any read", async (id) => {
    await expect(open(id)).rejects.toThrow("NEXT_NOT_FOUND")
    expect(assertAdmin).toHaveBeenCalled()
    expect(loader).not.toHaveBeenCalled()
  })

  it("shows the not-found page for a missing rule", async () => {
    loader.mockResolvedValue(null)
    await expect(open("cm-missing-rule")).rejects.toThrow("NEXT_NOT_FOUND")
  })
})
