/**
 * The MCP servers, knowledge base sources and skill sources the admin
 * assistant uses, for the settings page: server-only and admin-checked. A
 * secret never leaves with a row; the form gets whether one is saved, its last
 * four and its origin. A skill source also says whether its ref is pinned to a
 * commit.
 *
 * @module lib/data/assistant-sources
 */

import "server-only"

import { assertAdmin } from "@/lib/admin"
import { isCommitSha } from "@/lib/chatbot/knowledge/github"
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

export interface SkillSourceSettings {
  id: string
  name: string
  repo: string
  ref: string
  path: string
  token: SavedSecret | null
  isActive: boolean
  /** The ref is a full commit SHA, so the skills cannot change under it; false shows "Follows a moving ref". */
  pinned: boolean
}

export interface AssistantSources {
  mcpServers: McpServerSettings[]
  knowledgeSources: KnowledgeSourceSettings[]
  skillSources: SkillSourceSettings[]
}

/** Every MCP server, knowledge source and skill source, oldest first (admin only). */
export async function getAssistantSources(): Promise<AssistantSources> {
  await assertAdmin()
  const [servers, sources, skillSources] = await Promise.all([
    prisma.mcpServer.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.knowledgeSource.findMany({ orderBy: { createdAt: "asc" } }),
    prisma.skillSource.findMany({ orderBy: { createdAt: "asc" } }),
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
    skillSources: skillSources.map((source) => ({
      id: source.id,
      name: source.name,
      repo: source.repo,
      ref: source.ref,
      path: source.path,
      token: describeSecret(source.token),
      isActive: source.isActive,
      pinned: isCommitSha(source.ref),
    })),
  }
}
