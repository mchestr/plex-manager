import "server-only"

import { z } from "zod"

import { serviceFetch } from "@/lib/connections/http"

/**
 * Reads a Markdown knowledge base from a GitHub repository: the file list
 * (one `git/trees` call) and single files. Both are cached for ten minutes per
 * source, so a search does not re-read the repository.
 *
 * @module lib/chatbot/knowledge/github
 */

const CACHE_MS = 10 * 60_000
const MAX_DOCS = 300
const MAX_DOC_BYTES = 200_000
/** Entries kept per cache; the oldest goes first, so replaced sources do not pile up. */
const MAX_TREES = 20
const MAX_FILES = 400

export interface KnowledgeRepo {
  id: string
  name: string
  repo: string
  ref: string
  path: string
  token: string | null
  updatedAt: Date
}

const treeSchema = z.object({
  tree: z.array(z.object({ path: z.string(), type: z.string(), size: z.number().optional() })),
})

const trees = new Map<string, { at: number; paths: string[] }>()
const files = new Map<string, { at: number; text: string }>()

function headers(source: KnowledgeRepo, accept: string): Record<string, string> {
  return {
    Accept: accept,
    "User-Agent": "plex-manager",
    "X-GitHub-Api-Version": "2022-11-28",
    ...(source.token ? { Authorization: `Bearer ${source.token}` } : {}),
  }
}

/** Sets `key`, dropping the oldest entries beyond `max`. */
function remember<V>(cache: Map<string, V>, key: string, value: V, max: number): void {
  cache.delete(key)
  cache.set(key, value)
  while (cache.size > max) cache.delete(cache.keys().next().value as string)
}

const cacheKey = (source: KnowledgeRepo) => `${source.id}:${source.updatedAt.getTime()}`

/** Where a document lives on github.com, for citing. */
export function docUrl(source: KnowledgeRepo, path: string): string {
  return `https://github.com/${source.repo}/blob/${source.ref}/${path.split("/").map(encodeURIComponent).join("/")}`
}

/** Markdown files under the source's folder, at most {@link MAX_DOCS}; `null` when GitHub cannot be read. */
export async function listDocs(source: KnowledgeRepo): Promise<string[] | null> {
  const key = cacheKey(source)
  const hit = trees.get(key)
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.paths

  const result = await serviceFetch({
    service: "GitHub",
    url: `https://api.github.com/repos/${source.repo}/git/trees/${encodeURIComponent(source.ref)}?recursive=1`,
    headers: headers(source, "application/vnd.github+json"),
    schema: treeSchema,
  })
  if (!result.ok) return null

  const prefix = source.path ? `${source.path.replace(/\/+$/, "")}/` : ""
  const paths = result.data.tree
    .filter((entry) => entry.type === "blob" && /\.mdx?$/i.test(entry.path) && entry.path.startsWith(prefix) && (entry.size ?? 0) <= MAX_DOC_BYTES)
    .map((entry) => entry.path)
    .slice(0, MAX_DOCS)
  remember(trees, key, { at: Date.now(), paths }, MAX_TREES)
  return paths
}

/** One document's Markdown, or `null`. The path must be one {@link listDocs} returned. */
export async function readDoc(source: KnowledgeRepo, path: string): Promise<string | null> {
  const key = `${cacheKey(source)}:${path}`
  const hit = files.get(key)
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.text

  const docs = await listDocs(source)
  if (!docs?.includes(path)) return null

  const result = await serviceFetch({
    service: "GitHub",
    url: `https://api.github.com/repos/${source.repo}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(source.ref)}`,
    headers: headers(source, "application/vnd.github.raw+json"),
    responseType: "text",
    schema: z.string(),
  })
  if (!result.ok) return null
  remember(files, key, { at: Date.now(), text: result.data }, MAX_FILES)
  return result.data
}
