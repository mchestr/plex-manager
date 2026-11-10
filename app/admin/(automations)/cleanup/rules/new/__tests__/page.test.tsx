/**
 * The new-rule page (UX 3.1, TS 12.2, 12.6 editor item 1.7): its own admin
 * check before any read, the start parsed from the search params, and the
 * editor `key` of the parsed start, so another start mounts a fresh editor
 * in the one kept route instance (architecture-r4-1).
 */

import { isValidElement, type ReactElement } from "react"

import NewCleanupRulePage from "@/app/admin/(automations)/cleanup/rules/new/page"
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
jest.mock("@/lib/queue/connection", () => ({ isRedisConfigured: () => false }))
jest.mock("@/components/admin/cleanup/editor/rule-editor", () => ({ RuleEditor: () => null }))

const loader = getCleanupRuleEditor as jest.Mock
const DATA = { rule: { id: null } }

async function open(params: Record<string, string | string[] | undefined>) {
  const element = await NewCleanupRulePage({ searchParams: Promise.resolve(params) })
  if (!isValidElement(element)) throw new Error("no element")
  return element as ReactElement<RuleEditorProps>
}

beforeEach(() => {
  jest.clearAllMocks()
  loader.mockResolvedValue(DATA)
})

describe("the new-rule page", () => {
  it("checks the admin before it reads, and renders the editor with the data", async () => {
    const order: string[] = []
    ;(assertAdmin as jest.Mock).mockImplementation(async () => order.push("admin"))
    loader.mockImplementation(async () => {
      order.push("load")
      return DATA
    })
    const element = await open({ level: "movie" })
    expect(order).toEqual(["admin", "load"])
    expect(element.props.data).toBe(DATA)
    expect(element.props.redis).toBe(false)
    expect(typeof element.props.now).toBe("number")
    expect(loader).toHaveBeenCalledWith({ level: "movie" }, expect.any(Date))
  })

  it("starts a blank rule of Movies with no params or a bad level, with one key for one start", async () => {
    const plain = await open({})
    const movie = await open({ level: "movie" })
    const bad = await open({ level: "albums" })
    expect(plain.key).toBe(movie.key)
    expect(bad.key).toBe(movie.key)
    expect(loader).toHaveBeenNthCalledWith(3, { level: "movie" }, expect.any(Date))
    const show = await open({ level: "show" })
    expect(show.key).not.toBe(movie.key)
  })

  it("gives a recipe start another key, made from the recipe's own values only", async () => {
    const movie = await open({ level: "movie" })
    const recipe = await open({ recipe: "movies-nobody-watches", added: "2y", lastPlayed: "180d", grace: "30", other: "x" })
    expect(recipe.key).not.toBe(movie.key)
    expect(loader).toHaveBeenLastCalledWith(
      { recipe: "movies-nobody-watches", values: { added: "2y", lastPlayed: "180d", grace: "30" }, level: null },
      expect.any(Date)
    )
    const again = await open({ recipe: "movies-nobody-watches", grace: "30", lastPlayed: "180d", added: "2y", unrelated: "1" })
    expect(again.key).toBe(recipe.key)
    const other = await open({ recipe: "movies-nobody-watches", added: "365d" })
    expect(other.key).not.toBe(recipe.key)
  })

  it("takes the first of a repeated value, drops a long one and a bad recipe id, and keeps an asked level", async () => {
    await open({ recipe: "big-shows-nobody-plays", level: ["show", "movie"], size: ["100", "200"], lastPlayed: "9".repeat(40) })
    expect(loader).toHaveBeenLastCalledWith({ recipe: "big-shows-nobody-plays", values: { size: "100" }, level: "show" }, expect.any(Date))
    await open({ recipe: "no-such-recipe" })
    expect(loader).toHaveBeenLastCalledWith({ level: "movie" }, expect.any(Date))
  })

  it("shows the not-found page when the loader finds nothing", async () => {
    loader.mockResolvedValue(null)
    await expect(open({})).rejects.toThrow("NEXT_NOT_FOUND")
  })
})
