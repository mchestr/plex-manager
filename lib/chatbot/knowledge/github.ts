import "server-only"

import { z } from "zod"

import { serviceFetch, type ServiceFailure } from "@/lib/connections/http"

import { readCache } from "./read-cache"

/**
 * Reads a Markdown repository on GitHub, for knowledge bases and assistant
 * skills: the commit a ref points at (`commits/{ref}`), the file list (one
 * `git/trees` call) and single files.
 *
 * ## Pinning
 *
 * {@link resolveRef} turns a branch or tag into its commit SHA. A caller pins
 * the reads that follow by passing `{ ...source, ref: sha }`, so everything it
 * lists and reads comes from one commit. A ref that is already a full,
 * lowercase SHA ({@link isCommitSha}) is returned with no request.
 *
 * ## Keys
 *
 * | Read | At a commit SHA | At a branch or tag |
 * |---|---|---|
 * | ref | no request | `id:repo@ref:updatedAt`, ten minutes |
 * | tree | `id:repo@sha:folder`, no expiry | `id:updatedAt`, ten minutes |
 * | file | `id:repo@sha:folder:file`, no expiry | `id:updatedAt:file`, ten minutes |
 *
 * The source id is in every key, so a source without a token is never served
 * what another source read with one. At a commit, saving the source (Refresh
 * only bumps `updatedAt`) reuses what was read, since a commit cannot change,
 * while a new repo or folder reads again. Content read with a token stays
 * cached after the token is removed. The caches keep their bounds, 20 refs,
 * 20 listings and 400 files, shared by knowledge bases and skills.
 *
 * ## Failures
 *
 * A failed read is `rate_limited` (HTTP 429, or a 403 whose
 * `x-ratelimit-remaining` is `0` or whose message mentions a rate limit) or
 * `unreachable` (anything else). A `rate_limited` read is remembered for a
 * minute, or until the source is saved; any other failure is asked again on
 * the next call. Concurrent reads of one key share one request
 * (`lib/chatbot/knowledge/read-cache`).
 *
 * @module lib/chatbot/knowledge/github
 */

const CACHE_MS = 10 * 60_000
/**
 * Markdown files kept per listing. Exported for tests; production code reads
 * `listDocsResult().truncated`.
 * @internal
 */
export const MAX_DOCS = 300
const MAX_DOC_BYTES = 200_000
/** Entries kept per cache; the oldest goes first, so replaced sources do not pile up. */
const MAX_TREES = 20
const MAX_FILES = 400
const COMMIT_SHA = /^[0-9a-f]{40}$/

export interface KnowledgeRepo {
  id: string
  name: string
  repo: string
  ref: string
  path: string
  token: string | null
  updatedAt: Date
}

type GitHubReadFailure = "rate_limited" | "unreachable"
type Failed = { ok: false; reason: GitHubReadFailure }
type RefResult = { ok: true; sha: string } | Failed
type ListResult = { ok: true; paths: string[]; truncated: boolean } | Failed
type DocResult = { ok: true; text: string } | { ok: false; reason: GitHubReadFailure | "not_listed" }

const treeSchema = z.object({
  tree: z.array(z.object({ path: z.string(), type: z.string(), size: z.number().optional() })),
  truncated: z.boolean().optional(),
})

const refs = readCache<RefResult>(MAX_TREES)
const trees = readCache<ListResult>(MAX_TREES)
const files = readCache<DocResult>(MAX_FILES)

function headers(source: KnowledgeRepo, accept: string): Record<string, string> {
  return {
    Accept: accept,
    "User-Agent": "plex-manager",
    "X-GitHub-Api-Version": "2022-11-28",
    ...(source.token ? { Authorization: `Bearer ${source.token}` } : {}),
  }
}

/** Whether `ref` is a full, lowercase commit SHA, whose content cannot change. */
export function isCommitSha(ref: string): boolean {
  return COMMIT_SHA.test(ref)
}

const cacheKey = (source: KnowledgeRepo) =>
  isCommitSha(source.ref) ? `${source.id}:${source.repo}@${source.ref}:${source.path}` : `${source.id}:${source.updatedAt.getTime()}`

/** A tree or file read never goes stale at a commit, else after {@link CACHE_MS}. */
const readOptions = (source: KnowledgeRepo) => ({ ttlMs: isCommitSha(source.ref) ? Infinity : CACHE_MS, stamp: source.updatedAt.getTime() })

/** `rate_limited` for a 429, or a 403 whose header or message says so; anything else is `unreachable`. */
function classify(failure: ServiceFailure, remaining: string | null): GitHubReadFailure {
  if (failure.status === 429) return "rate_limited"
  const limited = failure.status === 403 && (remaining === "0" || /rate limit/i.test(failure.message ?? ""))
  return limited ? "rate_limited" : "unreachable"
}

/** One GitHub API read, with its failure classified. */
async function gitHubGet<T>(
  source: KnowledgeRepo,
  url: string,
  accept: string,
  schema: z.ZodType<T>,
  responseType?: "text"
): Promise<{ ok: true; data: T } | Failed> {
  let remaining: string | null = null
  const result = await serviceFetch({
    service: "GitHub",
    url,
    headers: headers(source, accept),
    schema,
    responseType,
    readErrorMessage: true,
    onResponse: (response) => {
      remaining = response.headers.get("x-ratelimit-remaining")
    },
  })
  return result.ok ? result : { ok: false, reason: classify(result, remaining) }
}

/** Where a document lives on github.com, for citing. */
export function docUrl(source: KnowledgeRepo, path: string): string {
  return `https://github.com/${source.repo}/blob/${source.ref}/${path.split("/").map(encodeURIComponent).join("/")}`
}

/** The commit `source.ref` points at, asked of GitHub at most once every ten minutes per source. */
export async function resolveRef(source: KnowledgeRepo): Promise<RefResult> {
  if (isCommitSha(source.ref)) return { ok: true, sha: source.ref }
  const stamp = source.updatedAt.getTime()
  return refs(`${source.id}:${source.repo}@${source.ref}:${stamp}`, { ttlMs: CACHE_MS, stamp }, async () => {
    const url = `https://api.github.com/repos/${source.repo}/commits/${encodeURIComponent(source.ref)}`
    const result = await gitHubGet(source, url, "application/vnd.github.sha", z.string().trim().regex(COMMIT_SHA), "text")
    return result.ok ? { ok: true, sha: result.data } : result
  })
}

/** Markdown files under the source's folder, at most {@link MAX_DOCS}; `truncated` when GitHub or the cap left some out. */
export async function listDocsResult(source: KnowledgeRepo): Promise<ListResult> {
  return trees(cacheKey(source), readOptions(source), async () => {
    const url = `https://api.github.com/repos/${source.repo}/git/trees/${encodeURIComponent(source.ref)}?recursive=1`
    const result = await gitHubGet(source, url, "application/vnd.github+json", treeSchema)
    if (!result.ok) return result

    const prefix = source.path ? `${source.path.replace(/\/+$/, "")}/` : ""
    const paths = result.data.tree
      .filter((entry) => entry.type === "blob" && /\.mdx?$/i.test(entry.path) && entry.path.startsWith(prefix) && (entry.size ?? 0) <= MAX_DOC_BYTES)
      .map((entry) => entry.path)
    return { ok: true, paths: paths.slice(0, MAX_DOCS), truncated: result.data.truncated === true || paths.length > MAX_DOCS }
  })
}

/** One document's Markdown. The path must be one {@link listDocsResult} returned, else it is `not_listed`. */
export async function readDocResult(source: KnowledgeRepo, path: string): Promise<DocResult> {
  return files(`${cacheKey(source)}:${path}`, readOptions(source), async () => {
    const listing = await listDocsResult(source)
    if (!listing.ok) return listing
    if (!listing.paths.includes(path)) return { ok: false, reason: "not_listed" }

    const url = `https://api.github.com/repos/${source.repo}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(source.ref)}`
    const result = await gitHubGet(source, url, "application/vnd.github.raw+json", z.string(), "text")
    return result.ok ? { ok: true, text: result.data } : result
  })
}

/** {@link listDocsResult}'s paths, or `null` when GitHub cannot be read. */
export async function listDocs(source: KnowledgeRepo): Promise<string[] | null> {
  const result = await listDocsResult(source)
  return result.ok ? result.paths : null
}

/** One document's Markdown, or `null`. The path must be one {@link listDocs} returned. */
export async function readDoc(source: KnowledgeRepo, path: string): Promise<string | null> {
  const result = await readDocResult(source, path)
  return result.ok ? result.text : null
}
