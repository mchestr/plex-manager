import { collectCards, retryAfterSeconds } from "@/lib/rewind/share/save-all"

const reply = (status: number, retryAfter?: string) =>
  ({ ok: status === 200, status, headers: new Headers(retryAfter ? { "retry-after": retryAfter } : {}), arrayBuffer: async () => new Uint8Array([status % 256]).buffer }) as Response

const cards = (n: number) => Array.from({ length: n }, (_, i) => ({ url: `/card/${i}`, name: `${i}.png` }))

describe("collectCards (P8.4)", () => {
  it("fetches three at a time", async () => {
    let open = 0
    let most = 0
    global.fetch = jest.fn(async () => {
      most = Math.max(most, ++open)
      await new Promise((resolve) => setTimeout(resolve, 1))
      open--
      return reply(200)
    }) as typeof fetch
    const saved: string[] = []
    const result = await collectCards(cards(7), { signal: new AbortController().signal, onCard: (name) => saved.push(name), onProgress: () => {} })
    expect(result).toEqual({ saved: 7, failed: 0 })
    expect(most).toBe(3)
    expect(saved.sort()).toEqual(cards(7).map((c) => c.name).sort())
  })

  it("waits once for retry-after on a 429, then counts a card that still fails", async () => {
    const statuses = [429, 200, 429, 429]
    global.fetch = jest.fn(async () => reply(statuses.shift() ?? 500, "4")) as typeof fetch
    const sleep = jest.fn(async () => {})
    const progress: number[] = []
    const result = await collectCards(cards(2).slice(0, 1), { signal: new AbortController().signal, onCard: () => {}, onProgress: (n) => progress.push(n), sleep })
    expect(result).toEqual({ saved: 1, failed: 0 })
    expect(sleep).toHaveBeenCalledWith(4000, expect.anything())
    const again = await collectCards(cards(1), { signal: new AbortController().signal, onCard: () => {}, onProgress: (n) => progress.push(n), sleep })
    expect(again).toEqual({ saved: 0, failed: 1 })
    expect(progress).toEqual([1, 1])
  })

  it("stops when the signal aborts", async () => {
    const controller = new AbortController()
    global.fetch = jest.fn(async () => {
      controller.abort()
      throw new DOMException("aborted", "AbortError")
    }) as typeof fetch
    await expect(collectCards(cards(3), { signal: controller.signal, onCard: () => {}, onProgress: () => {} })).rejects.toThrow()
  })

  it("reads retry-after as clamped seconds", () => {
    expect(retryAfterSeconds("5")).toBe(5)
    expect(retryAfterSeconds("600")).toBe(30)
    expect(retryAfterSeconds(null)).toBe(2)
    expect(retryAfterSeconds("soon")).toBe(2)
  })
})
