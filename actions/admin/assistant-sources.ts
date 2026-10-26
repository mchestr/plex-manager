"use server"

/**
 * MCP servers and knowledge base sources for the admin assistant.
 *
 * An MCP server's auth header value is sent only to the origin it was saved
 * for: a blank value keeps the stored one while the URL's origin is
 * unchanged (`resolveSecretForOrigin`, SEC-31). A tool reaches the model only
 * after the admin turns it on. Every change is audited without its secrets.
 *
 * @module actions/admin/assistant-sources
 */

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { adminAction } from "@/lib/actions/define-action"
import { fail, ok } from "@/lib/actions/result"
import { listDocs } from "@/lib/chatbot/knowledge/github"
import { mcpListTools } from "@/lib/chatbot/mcp/client"
import { prisma } from "@/lib/prisma"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"
import { resolveSecretForOrigin } from "@/lib/security/secret-reuse"
import { normalizeBaseUrl } from "@/lib/validations/shared-schemas"

const recordId = z.string().min(1).max(100)
const name = z.string().trim().min(1, "Enter a name").max(60)
const headerName = z.string().trim().regex(/^[A-Za-z0-9-]{1,64}$/, "Use letters, digits and hyphens").optional().or(z.literal(""))

const mcpInput = z.object({
  id: recordId.optional(),
  name,
  url: z.string().trim().max(2048),
  authHeaderName: headerName,
  /** Blank keeps the stored value while the origin is unchanged. */
  authHeaderSecret: z.string().max(2000).optional(),
  isActive: z.boolean(),
  enabledTools: z.array(z.string().min(1).max(128)).max(200),
})

const knowledgeInput = z.object({
  id: recordId.optional(),
  name,
  repo: z.string().trim().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/, "Use owner/name, for example mchestr/knowledgebase"),
  ref: z.string().trim().min(1).max(100).regex(/^[A-Za-z0-9_./-]+$/, "Use a branch, tag or commit"),
  path: z.string().trim().max(200).regex(/^[A-Za-z0-9_./ -]*$/, "Use a folder path"),
  /** Blank keeps the stored token. */
  token: z.string().max(500).optional(),
  isActive: z.boolean(),
})

function audit(userId: string, kind: "mcp" | "knowledge", action: "saved" | "deleted", id: string) {
  logAuditEvent(AuditEventType.ASSISTANT_SOURCE_CHANGED, userId, { kind, action, id })
  revalidatePath("/admin/settings")
}

/** Add or change an MCP server. */
export const saveMcpServer = adminAction({
  input: mcpInput,
  rateLimit: { name: "admin" },
  fallbackError: "Could not save the MCP server",
  handler: async (input, { userId }) => {
    const url = normalizeBaseUrl(input.url)
    if (!url) return fail("VALIDATION", "Enter an http or https URL without credentials or a query string", { fieldErrors: { url: ["Enter an http or https URL"] } })

    const stored = input.id ? await prisma.mcpServer.findUnique({ where: { id: input.id } }) : null
    if (input.id && !stored) return fail("NOT_FOUND", "That MCP server no longer exists")

    const authHeaderName = input.authHeaderName || null
    let authHeaderSecret: string | null = null
    if (authHeaderName) {
      const secret = resolveSecretForOrigin({
        submitted: input.authHeaderSecret,
        stored: stored ? { secret: stored.authHeaderSecret, url: stored.url } : null,
        submittedUrl: url,
      })
      if (!secret.ok) {
        return fail("VALIDATION", "Enter the header value (again, when the address changed).", { fieldErrors: { authHeaderSecret: ["Enter the header value"] } })
      }
      authHeaderSecret = secret.secret
    }

    const data = {
      name: input.name,
      url,
      authHeaderName,
      authHeaderSecret,
      isActive: input.isActive,
      enabledTools: [...new Set(input.enabledTools)],
    }
    const clash = await prisma.mcpServer.findFirst({ where: { name: input.name, NOT: { id: input.id ?? "" } }, select: { id: true } })
    if (clash) return fail("CONFLICT", "An MCP server with that name already exists", { fieldErrors: { name: ["Already in use"] } })

    const row = input.id
      ? await prisma.mcpServer.update({ where: { id: input.id }, data })
      : await prisma.mcpServer.create({ data })
    audit(userId, "mcp", "saved", row.id)
    return ok({ id: row.id })
  },
})

export const deleteMcpServer = adminAction({
  input: z.object({ id: recordId }),
  rateLimit: { name: "admin" },
  fallbackError: "Could not remove the MCP server",
  handler: async ({ id }, { userId }) => {
    const { count } = await prisma.mcpServer.deleteMany({ where: { id } })
    if (count === 0) return fail("NOT_FOUND", "That MCP server no longer exists")
    audit(userId, "mcp", "deleted", id)
    return ok(null)
  },
})

/** The tools a saved MCP server lists, for the per-tool switches. */
export const discoverMcpTools = adminAction({
  input: z.object({ id: recordId }),
  rateLimit: { name: "admin" },
  fallbackError: "Could not list the tools",
  handler: async ({ id }) => {
    const server = await prisma.mcpServer.findUnique({ where: { id } })
    if (!server) return fail("NOT_FOUND", "That MCP server no longer exists")
    const result = await mcpListTools({ url: server.url, authHeaderName: server.authHeaderName, authHeaderSecret: server.authHeaderSecret })
    if (!result.ok) {
      const copy = {
        UNAUTHORIZED: "The server refused the credentials.",
        UNREACHABLE: "The server could not be reached.",
        PROTOCOL: "The server did not answer like an MCP server.",
        TOOL_ERROR: "The server reported an error.",
      } as const
      return fail("UPSTREAM_UNAVAILABLE", copy[result.code])
    }
    return ok({ tools: result.data.map(({ name: toolName, description, readOnlyHint }) => ({ name: toolName, description: description.slice(0, 200), readOnlyHint })) })
  },
})

/** Add or change a knowledge base source; the result says how many documents it found. */
export const saveKnowledgeSource = adminAction({
  input: knowledgeInput,
  rateLimit: { name: "admin" },
  fallbackError: "Could not save the knowledge base",
  handler: async (input, { userId }) => {
    const stored = input.id ? await prisma.knowledgeSource.findUnique({ where: { id: input.id } }) : null
    if (input.id && !stored) return fail("NOT_FOUND", "That knowledge base no longer exists")

    const clash = await prisma.knowledgeSource.findFirst({ where: { name: input.name, NOT: { id: input.id ?? "" } }, select: { id: true } })
    if (clash) return fail("CONFLICT", "A knowledge base with that name already exists", { fieldErrors: { name: ["Already in use"] } })

    // The token goes only to api.github.com, so a blank one keeps the stored token
    const token = input.token?.trim() || stored?.token || null
    const data = { name: input.name, repo: input.repo, ref: input.ref, path: input.path.replace(/^\/+|\/+$/g, ""), token, isActive: input.isActive }
    const row = input.id
      ? await prisma.knowledgeSource.update({ where: { id: input.id }, data })
      : await prisma.knowledgeSource.create({ data })
    audit(userId, "knowledge", "saved", row.id)

    const docs = await listDocs(row)
    return ok({ id: row.id, docCount: docs?.length ?? null })
  },
})

export const deleteKnowledgeSource = adminAction({
  input: z.object({ id: recordId }),
  rateLimit: { name: "admin" },
  fallbackError: "Could not remove the knowledge base",
  handler: async ({ id }, { userId }) => {
    const { count } = await prisma.knowledgeSource.deleteMany({ where: { id } })
    if (count === 0) return fail("NOT_FOUND", "That knowledge base no longer exists")
    audit(userId, "knowledge", "deleted", id)
    return ok(null)
  },
})
