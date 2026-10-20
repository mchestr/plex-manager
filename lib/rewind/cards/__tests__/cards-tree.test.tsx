/**
 * @jest-environment node
 *
 * The Satori tree test (design 6.4): every card, at every size, has
 * `display: 'flex'` on every element with more than one child, and its text
 * names the member only when the card is signed.
 */

import { isValidElement, type ReactElement, type ReactNode } from "react"

import { CARD_PAGES, renderCard } from "@/lib/rewind/cards"
import { fixtureRewind, shareContext, shareOptions } from "@/lib/wrapped/data/__tests__/share-fixture"
import type { RewindDataV3 } from "@/lib/wrapped/data/schema-v3"
import { cardInput, toShareSafe, type CardSize } from "@/lib/wrapped/data/share-safe"
import type { ShareOptions } from "@/lib/wrapped/data/share-safe-schema"

interface HostNode {
  type: string
  style: Record<string, unknown>
  children: Array<HostNode | string>
}

/** Expands function components into the host tree Satori draws. */
function expand(node: ReactNode): Array<HostNode | string> {
  if (node === null || node === undefined || typeof node === "boolean") return []
  if (typeof node === "string" || typeof node === "number") return [String(node)]
  if (Array.isArray(node)) return node.flatMap(expand)
  if (!isValidElement(node)) return []
  const element = node as ReactElement<{ children?: ReactNode; style?: Record<string, unknown> }>
  if (typeof element.type === "function") return expand((element.type as (props: unknown) => ReactNode)(element.props))
  return [{ type: String(element.type), style: element.props.style ?? {}, children: expand(element.props.children) }]
}

function walk(node: HostNode | string, visit: (node: HostNode) => void): void {
  if (typeof node === "string") return
  visit(node)
  node.children.forEach((child) => walk(child, visit))
}

function text(node: HostNode | string): string {
  return typeof node === "string" ? node : node.children.map(text).join(" ")
}

let heavy: RewindDataV3

beforeAll(async () => {
  heavy = await fixtureRewind("heavy")
})

function tree(page: (typeof CARD_PAGES)[number], size: CardSize, overrides: Partial<ShareOptions> = {}, ctx = shareContext()) {
  const options = shareOptions({ pages: [page], ...overrides })
  const input = cardInput(toShareSafe(heavy, options, ctx), page, size, { factsHash: heavy.factsHash, options, ctx })
  if (!input) throw new Error(`${page} is not published`)
  return expand(renderCard(input))[0]
}

const CASES = CARD_PAGES.flatMap((page) =>
  (["story", "og"] as const).flatMap((size) => [
    [page, size, {}],
    [page, size, { signed: true, dailyDetail: true }],
  ] as const)
)

describe.each(CASES)("%s card (%s, %j)", (page, size, overrides) => {
  it("sets display: flex on every element with more than one child", () => {
    const offenders: string[] = []
    walk(tree(page, size, overrides), (node) => {
      if (node.children.length > 1 && node.style.display !== "flex") offenders.push(`${node.type} ${JSON.stringify(node.style)}`)
    })
    expect(offenders).toEqual([])
  })

  it("names the member only when signed", () => {
    const first = heavy.facts["member.firstName"]!.display
    expect(text(tree(page, size, { ...overrides, signed: false }))).not.toContain(first)
  })
})

it("names the member on a signed cover", () => {
  expect(text(tree("cover", "story", { signed: true }))).toContain(heavy.facts["member.firstName"]!.display)
})

it("prints Rewind 2026 in place of the server name when the admin hides it", () => {
  const card = text(tree("cover", "story", {}, shareContext({ showServerName: false })))
  expect(card).toContain("Rewind 2026")
  expect(card).not.toContain("Chester Family Plex")
})
