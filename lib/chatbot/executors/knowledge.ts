import "server-only"

import { z } from "zod"

import { docTitle, scoreDoc, searchTerms, snippets } from "@/lib/chatbot/knowledge/search"
import { docUrl, listDocs, readDoc, type KnowledgeRepo } from "@/lib/chatbot/knowledge/github"
import { assertAdmin } from "@/lib/admin"
import { prisma } from "@/lib/prisma"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"

const MAX_FETCHED_DOCS = 60
const MAX_RESULTS = 5
const MAX_DOC_CHARS = 12_000

const searchArgs = z.object({ query: z.string().trim().min(2).max(200) })
const readArgs = z.object({ source: z.string().min(1).max(100), path: z.string().min(1).max(300) })

async function activeSources(): Promise<KnowledgeRepo[]> {
  return prisma.knowledgeSource.findMany({ where: { isActive: true }, orderBy: { name: "asc" } })
}

async function search(query: string, sources: KnowledgeRepo[]) {
  const terms = searchTerms(query)
  if (terms.length === 0) return { results: [] }

  const results = (
    await Promise.all(
      sources.map(async (source) => {
        const docs = await listDocs(source)
        if (!docs) return []
        // Path matches first, so the fetch budget goes to the likeliest documents
        const ranked = docs
          .map((path) => ({ path, score: scoreDoc(path, "", terms) }))
          .sort((a, b) => b.score - a.score)
          .slice(0, MAX_FETCHED_DOCS)
        const scored = await Promise.all(
          ranked.map(async ({ path }) => {
            const text = (await readDoc(source, path)) ?? ""
            return { source, path, text, score: scoreDoc(path, text, terms) }
          })
        )
        return scored.filter((doc) => doc.score > 0)
      })
    )
  )
    .flat()
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_RESULTS)

  return {
    results: results.map(({ source, path, text }) => ({
      source: source.name,
      path,
      title: docTitle(path, text),
      url: docUrl(source, path),
      snippets: snippets(text, terms),
    })),
  }
}

/**
 * Runs a knowledge base tool for an admin. The document text is untrusted
 * data like any tool result; the conversation wraps it as such.
 */
export async function executeKnowledgeTool(toolName: string, args: Record<string, unknown>, userId?: string): Promise<string> {
  await assertAdmin()
  const sources = await activeSources()
  if (sources.length === 0) return JSON.stringify({ error: "No knowledge base is configured. Add one in Settings, Assistant sources." })

  if (toolName === "search_knowledge_base") {
    const parsed = searchArgs.safeParse(args)
    if (!parsed.success) return "Error: Invalid tool arguments"
    logAuditEvent(AuditEventType.ASSISTANT_DATA_READ, userId ?? "unknown", { toolName })
    return JSON.stringify(await search(parsed.data.query, sources))
  }

  if (toolName === "read_knowledge_doc") {
    const parsed = readArgs.safeParse(args)
    if (!parsed.success) return "Error: Invalid tool arguments"
    const source = sources.find((candidate) => candidate.name === parsed.data.source)
    const text = source ? await readDoc(source, parsed.data.path) : null
    if (!source || text === null) return JSON.stringify({ error: "That document was not found in the knowledge base." })
    logAuditEvent(AuditEventType.ASSISTANT_DATA_READ, userId ?? "unknown", { toolName })
    return JSON.stringify({
      source: source.name,
      path: parsed.data.path,
      url: docUrl(source, parsed.data.path),
      content: text.slice(0, MAX_DOC_CHARS),
      truncated: text.length > MAX_DOC_CHARS,
    })
  }

  return "Error: Unknown tool"
}
