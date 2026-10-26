/**
 * @jest-environment node
 */

import { serviceFetch } from "@/lib/connections/http"

import { docUrl, listDocs, readDoc, type KnowledgeRepo } from "../github"

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

beforeEach(() => fetchMock.mockReset())

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
