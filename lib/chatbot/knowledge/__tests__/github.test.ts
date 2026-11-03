/**
 * @jest-environment node
 */

import { serviceFetch, type ServiceFetchOptions, type ServiceResult } from "@/lib/connections/http"

import { docUrl, isCommitSha, listDocs, listDocsResult, readDoc, readDocResult, resolveRef, type KnowledgeRepo } from "../github"

jest.mock("@/lib/connections/http", () => ({ serviceFetch: jest.fn() }))

const fetchMock = jest.mocked(serviceFetch)
let seq = 0
const source = (over: Partial<KnowledgeRepo> = {}): KnowledgeRepo => ({
  id: `kb-${++seq}`,
  name: "KB",
  repo: "mchestr/knowledgebase",
  ref: "main",
  path: "",
  token: null,
  updatedAt: new Date(seq),
  ...over,
})
const tree = (entries: Array<{ path: string; type?: string; size?: number }>) => ({
  ok: true as const,
  data: { tree: entries.map((entry) => ({ type: "blob", ...entry })) },
})

const SHA = "c".repeat(40)

interface Reply {
  body?: unknown
  headers?: Record<string, string>
  message?: string
}

/**
 * What `serviceFetch` gives for one response: it shows `onResponse` the status
 * and headers first, reads a 4xx `message` only when asked, and parses a 2xx
 * body with the caller's schema.
 */
const respond =
  (status: number, { body, headers = {}, message }: Reply = {}) =>
  async <T>(options: ServiceFetchOptions<T>): Promise<ServiceResult<T>> => {
    options.onResponse?.({ status, headers: new Headers(headers) })
    if (status >= 300) return { ok: false, code: "HTTP", status, ...(message !== undefined && options.readErrorMessage ? { message } : {}) }
    const parsed = options.schema.safeParse(body)
    return parsed.success ? { ok: true, data: parsed.data } : { ok: false, code: "INVALID_RESPONSE" }
  }

const treeBody = (paths: string[], truncated?: boolean) => ({
  tree: paths.map((path) => ({ path, type: "blob" })),
  ...(truncated === undefined ? {} : { truncated }),
})

/** Answers by URL: `SHA` for a ref, `paths` for the tree, and `# <path>` for a file. */
const answerAll = (paths: string[]) =>
  fetchMock.mockImplementation((options) => {
    const file = /\/contents\/([^?]+)/.exec(options.url)?.[1]
    const body = options.url.includes("/commits/") ? SHA : file === undefined ? treeBody(paths) : `# ${file}`
    return respond(200, { body })(options)
  })

/** The same source, saved again (a new `updatedAt`, as Refresh or a new token gives). */
const later = (kb: KnowledgeRepo): KnowledgeRepo => ({ ...kb, updatedAt: new Date(kb.updatedAt.getTime() + 1) })
const urls = () => fetchMock.mock.calls.map(([options]) => options.url)

beforeEach(() => fetchMock.mockReset())
afterEach(() => jest.useRealTimers())

describe("listDocs", () => {
  it("keeps Markdown files under the folder and drops big ones", async () => {
    fetchMock.mockResolvedValue(
      tree([{ path: "docs/a.md" }, { path: "docs/b.png" }, { path: "other/c.md" }, { path: "docs/big.md", size: 300_000 }, { path: "docs", type: "tree" }])
    )
    expect(await listDocs(source({ path: "docs/" }))).toEqual(["docs/a.md"])
  })

  it("sends the token to GitHub and caches the listing", async () => {
    fetchMock.mockResolvedValue(tree([{ path: "a.md" }]))
    const kb = source({ token: "ghp_x" })

    await listDocs(kb)
    await listDocs(kb)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toMatchObject({
      url: "https://api.github.com/repos/mchestr/knowledgebase/git/trees/main?recursive=1",
      headers: expect.objectContaining({ Authorization: "Bearer ghp_x" }),
    })
  })

  it("is null when GitHub cannot be read", async () => {
    fetchMock.mockResolvedValue({ ok: false, code: "HTTP", status: 404 })
    expect(await listDocs(source())).toBeNull()
  })
})

describe("cache size", () => {
  it("drops the oldest listing once more than twenty are kept", async () => {
    fetchMock.mockResolvedValue(tree([{ path: "a.md" }]))
    const first = source()
    await listDocs(first)
    for (let i = 0; i < 20; i++) await listDocs(source())
    expect(fetchMock).toHaveBeenCalledTimes(21)

    await listDocs(first)

    expect(fetchMock).toHaveBeenCalledTimes(22)
  })
})

describe("readDoc", () => {
  it("reads only a path the listing returned", async () => {
    fetchMock.mockResolvedValueOnce(tree([{ path: "a.md" }])).mockResolvedValue({ ok: true, data: "# A" })
    const kb = source()

    expect(await readDoc(kb, "../../etc/passwd")).toBeNull()
    expect(await readDoc(kb, "a.md")).toBe("# A")
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})

describe("docUrl", () => {
  it("links to the file on github.com, encoding each segment", () => {
    expect(docUrl(source(), "run books/a b.md")).toBe("https://github.com/mchestr/knowledgebase/blob/main/run%20books/a%20b.md")
  })
})

describe("resolveRef", () => {
  it("resolveRef returns a SHA ref without a request", async () => {
    expect(await resolveRef(source({ ref: "a".repeat(40) }))).toEqual({ ok: true, sha: "a".repeat(40) })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(isCommitSha("a".repeat(40))).toBe(true)
    expect(isCommitSha("A".repeat(40))).toBe(false)
    expect(isCommitSha("deadbeef")).toBe(false)
  })

  it("resolveRef asks GitHub for a branch", async () => {
    jest.useFakeTimers()
    fetchMock.mockImplementation(respond(200, { body: "b".repeat(40) }))
    const kb = source({ token: "ghp_x" })

    expect(await resolveRef(kb)).toEqual({ ok: true, sha: "b".repeat(40) })
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toMatchObject({
      url: "https://api.github.com/repos/mchestr/knowledgebase/commits/main",
      responseType: "text",
      headers: expect.objectContaining({ Accept: "application/vnd.github.sha", Authorization: "Bearer ghp_x" }),
    })

    jest.advanceTimersByTime(10 * 60_000 - 1)
    expect(await resolveRef(kb)).toEqual({ ok: true, sha: "b".repeat(40) })
    expect(fetchMock).toHaveBeenCalledTimes(1)

    await resolveRef(later(kb))
    expect(fetchMock).toHaveBeenCalledTimes(2)

    jest.advanceTimersByTime(1)
    await resolveRef(kb)
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it("resolveRef classifies failures", async () => {
    const cases = [
      [respond(429), "rate_limited"],
      [respond(403, { headers: { "x-ratelimit-remaining": "0" } }), "rate_limited"],
      [respond(403, { message: "You have exceeded a secondary rate limit" }), "rate_limited"],
      [respond(403, { message: "Resource not accessible by personal access token" }), "unreachable"],
      [respond(403, { headers: { "x-ratelimit-remaining": "59" } }), "unreachable"],
      [respond(404), "unreachable"],
      [respond(200, { body: "not-a-sha" }), "unreachable"],
    ] as const

    for (const [reply, reason] of cases) {
      fetchMock.mockImplementationOnce(reply)
      expect(await resolveRef(source())).toEqual({ ok: false, reason })
    }
    expect(fetchMock).toHaveBeenCalledTimes(cases.length)
  })

  it("encodes a ref with a slash", async () => {
    fetchMock.mockImplementation(respond(200, { body: "d".repeat(40) }))

    expect(await resolveRef(source({ ref: "feature/x" }))).toEqual({ ok: true, sha: "d".repeat(40) })
    expect(urls()).toEqual(["https://api.github.com/repos/mchestr/knowledgebase/commits/feature%2Fx"])
  })
})

describe("listDocsResult", () => {
  it("listDocsResult reports a rate-limited tree", async () => {
    fetchMock.mockImplementation(respond(429))

    expect(await listDocsResult(source())).toEqual({ ok: false, reason: "rate_limited" })
    expect(await listDocs(source())).toBeNull()
  })

  it("listDocsResult reports a cut listing", async () => {
    fetchMock.mockImplementation(respond(200, { body: treeBody(["a.md"], true) }))
    expect(await listDocsResult(source())).toEqual({ ok: true, paths: ["a.md"], truncated: true })

    const docs = Array.from({ length: 301 }, (_, i) => `doc-${String(i).padStart(3, "0")}.md`)
    fetchMock.mockImplementation(respond(200, { body: treeBody(docs) }))
    expect(await listDocsResult(source())).toEqual({ ok: true, paths: docs.slice(0, 300), truncated: true })

    fetchMock.mockImplementation(respond(200, { body: treeBody(docs.slice(0, 300)) }))
    expect(await listDocsResult(source())).toEqual({ ok: true, paths: docs.slice(0, 300), truncated: false })
  })
})

describe("reads at a commit", () => {
  it("reads at a SHA survive a Refresh", async () => {
    jest.useFakeTimers()
    answerAll(["a.md"])
    const kb = source({ ref: SHA })

    expect(await listDocs(kb)).toEqual(["a.md"])
    expect(await readDoc(kb, "a.md")).toBe("# a.md")
    jest.advanceTimersByTime(11 * 60_000)

    expect(await listDocs(later(kb))).toEqual(["a.md"])
    expect(await readDoc(later(kb), "a.md")).toBe("# a.md")
    expect(urls()).toEqual([
      `https://api.github.com/repos/mchestr/knowledgebase/git/trees/${SHA}?recursive=1`,
      `https://api.github.com/repos/mchestr/knowledgebase/contents/a.md?ref=${SHA}`,
    ])
  })

  it("a pinned source lists again when its folder or repo changes", async () => {
    answerAll(["a/x.md", "b/y.md"])
    const inA = source({ ref: SHA, path: "a" })
    const inB = { ...inA, path: "b" }

    expect(await listDocs(inA)).toEqual(["a/x.md"])
    expect(await readDoc(inA, "a/x.md")).toBe("# a/x.md")
    expect(await listDocs(inB)).toEqual(["b/y.md"])
    expect(fetchMock).toHaveBeenCalledTimes(3)

    expect(await readDoc(inB, "a/x.md")).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(3)

    expect(await listDocs({ ...inB, repo: "mchestr/other" })).toEqual(["b/y.md"])
    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(urls()[3]).toBe(`https://api.github.com/repos/mchestr/other/git/trees/${SHA}?recursive=1`)
  })

  it("sources never share SHA reads", async () => {
    answerAll(["a.md"])
    const open = source({ ref: SHA })
    const withToken = source({ ref: SHA, token: "ghp_x" })

    await readDoc(withToken, "a.md")
    await readDoc(open, "a.md")

    expect(urls().filter((url) => url.includes("/git/trees/"))).toHaveLength(2)
    expect(urls().filter((url) => url.includes("/contents/"))).toHaveLength(2)
  })
})

describe("readDocResult", () => {
  it("readDocResult refuses an unlisted path", async () => {
    answerAll(["a.md"])

    expect(await readDocResult(source(), "b.md")).toEqual({ ok: false, reason: "not_listed" })
    expect(urls()).toEqual(["https://api.github.com/repos/mchestr/knowledgebase/git/trees/main?recursive=1"])
  })
})

describe("shared and remembered reads", () => {
  it("shares a read in flight", async () => {
    const gate = Promise.withResolvers<void>()
    fetchMock.mockImplementation(async (options) => {
      await gate.promise
      const body = options.url.includes("/commits/") ? SHA : options.url.includes("/contents/") ? "# A" : treeBody(["a.md"])
      return respond(200, { body })(options)
    })
    const [forList, forRef, forDoc] = [source(), source(), source()]

    const reads = Promise.all([
      listDocsResult(forList),
      listDocsResult(forList),
      resolveRef(forRef),
      resolveRef(forRef),
      readDocResult(forDoc, "a.md"),
      readDocResult(forDoc, "a.md"),
    ])
    gate.resolve()

    const listing = { ok: true, paths: ["a.md"], truncated: false }
    expect(await reads).toEqual([listing, listing, { ok: true, sha: SHA }, { ok: true, sha: SHA }, { ok: true, text: "# A" }, { ok: true, text: "# A" }])
    expect(urls().filter((url) => url.includes("/git/trees/"))).toHaveLength(2)
    expect(urls().filter((url) => url.includes("/commits/"))).toHaveLength(1)
    expect(urls().filter((url) => url.includes("/contents/"))).toHaveLength(1)
  })

  it("remembers a rate limit for a minute", async () => {
    jest.useFakeTimers()
    fetchMock.mockImplementation(respond(403, { headers: { "x-ratelimit-remaining": "0" } }))
    const kb = source({ ref: SHA })

    expect(await listDocsResult(kb)).toEqual({ ok: false, reason: "rate_limited" })
    jest.advanceTimersByTime(59_999)
    expect(await listDocsResult(kb)).toEqual({ ok: false, reason: "rate_limited" })
    expect(fetchMock).toHaveBeenCalledTimes(1)

    jest.advanceTimersByTime(1)
    expect(await listDocsResult(kb)).toEqual({ ok: false, reason: "rate_limited" })
    expect(fetchMock).toHaveBeenCalledTimes(2)

    expect(await listDocsResult(later(kb))).toEqual({ ok: false, reason: "rate_limited" })
    expect(fetchMock).toHaveBeenCalledTimes(3)

    // A ref and a file read are remembered the same way
    const branch = source()
    expect(await resolveRef(branch)).toEqual({ ok: false, reason: "rate_limited" })
    expect(await resolveRef(branch)).toEqual({ ok: false, reason: "rate_limited" })
    expect(fetchMock).toHaveBeenCalledTimes(4)

    fetchMock.mockImplementation((options) => (options.url.includes("/contents/") ? respond(429) : respond(200, { body: treeBody(["a.md"]) }))(options))
    const pinned = source({ ref: SHA })
    expect(await readDocResult(pinned, "a.md")).toEqual({ ok: false, reason: "rate_limited" })
    expect(await readDocResult(pinned, "a.md")).toEqual({ ok: false, reason: "rate_limited" })
    expect(fetchMock).toHaveBeenCalledTimes(6)
  })

  it("retries other failures at once", async () => {
    fetchMock.mockImplementation(respond(500))
    const kb = source()

    expect(await listDocsResult(kb)).toEqual({ ok: false, reason: "unreachable" })
    expect(await listDocsResult(kb)).toEqual({ ok: false, reason: "unreachable" })
    expect(fetchMock).toHaveBeenCalledTimes(2)

    const other = source()
    expect(await listDocs(other)).toBeNull()
    expect(await listDocs(other)).toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })
})
