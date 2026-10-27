/**
 * The MCP servers and knowledge base sources the admin assistant uses, for the
 * settings page: server-only and admin-checked. A secret never leaves with a
 * row; the form gets whether one is saved, its last four and its origin.
 *
 * @module lib/data/assistant-sources
 */

import "server-only"

import { assertAdmin } from "@/lib/admin"
import { prisma } from "@/lib/prisma"
import { describeSecret } from "@/lib/security/secret-reuse"
import type { SavedSecret } from "@/lib/security/saved-secret"

export interface McpServerSettings {
  id: string
  name: string
  url: string
  authHeaderName: string | null
  authSecret: SavedSecret | null
  isActive: boolean
  enabledTools: string[]
}

export interface KnowledgeSourceSettings {
  id: string
  name: string
  repo: string
  ref: string
  path: string
  token: SavedSecret | null
  isActive: boolean
}

export interface AssistantSources {
  mcpServers: McpServerSettings[]
  knowledgeSources: KnowledgeSourceSettings[]
}

/** Every MCP server and knowledge source, oldest first (admin only). */
export async function getAssistantSources(): Promise<AssistantSources> {
  await assertAdmin()
  const [servers, sources] = await Promise.all([
    prisma.mcpServer.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.knowledgeSource.findMany({ orderBy: { createdAt: "asc" } }),
  ])
  return {
    mcpServers: servers.map((server) => ({
      id: server.id,
      name: server.name,
      url: server.url,
      authHeaderName: server.authHeaderName,
      authSecret: describeSecret(server.authHeaderSecret, server.url),
      isActive: server.isActive,
      enabledTools: server.enabledTools,
    })),
    knowledgeSources: sources.map((source) => ({
      id: source.id,
      name: source.name,
      repo: source.repo,
      ref: source.ref,
      path: source.path,
      token: describeSecret(source.token),
      isActive: source.isActive,
    })),
  }
}
