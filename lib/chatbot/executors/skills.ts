import "server-only"

import { z } from "zod"

import { assertAdmin } from "@/lib/admin"
import { docUrl, readDocResult } from "@/lib/chatbot/knowledge/github"
import type { SkillEntry } from "@/lib/chatbot/skills/catalog"
import { parseSkillMarkdown } from "@/lib/chatbot/skills/frontmatter"
import { loadSkillCatalogWithin } from "@/lib/chatbot/skills/within"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"
import { createLogger } from "@/lib/utils/logger"

/**
 * Runs `load_skill` and `read_skill_file` for an admin: a skill's
 * instructions and the supporting files it lists, read from GitHub at the
 * commit the catalogue resolved.
 *
 * Only what the catalogue holds can be read (`loadSkillCatalogWithin`, the
 * same five-second bound as the turn's own load). A skill left out of the
 * prompt is refused like an unknown name, so what the model can load is
 * exactly what it was shown. A file is read only when its path equals,
 * exactly and case-sensitively, one the skill lists: nothing is normalised,
 * so `..`, `./` or another case never matches.
 *
 * Every read is audited as `ASSISTANT_DATA_READ` with the tool, the skill, the
 * repo path read and `repo@sha`, so the audit shows exactly what was followed.
 * No result carries the source's token. The conversation wraps the results as
 * `admin_skill` (`SKILL_TOOL_NAMES`), not `untrusted_data`.
 *
 * @module lib/chatbot/executors/skills
 */

const logger = createLogger("CHATBOT_SKILLS")

const MAX_CONTENT_CHARS = 12_000

const loadArgs = z.object({ name: z.string().trim().min(1).max(64) })
// Long enough for any listed path; only an exact listed path is read anyway
const fileArgs = z.object({ skill: z.string().trim().min(1).max(64), path: z.string().min(1).max(1024) })

const INVALID_ARGUMENTS = "Error: Invalid tool arguments"
// "In a minute": a failed catalogue load is remembered for 30 seconds, and a rate-limited read for 60
const UNAVAILABLE = JSON.stringify({ error: "The skills could not be read from GitHub right now. Try again in a minute." })
const NOT_CONFIGURED = JSON.stringify({ error: "No skills are configured. Add a skill source in Settings, Assistant sources." })
const SKILL_NOT_FOUND = JSON.stringify({ error: "That skill was not found." })
const FILE_NOT_FOUND = JSON.stringify({ error: "That file was not found in the skill." })
const FILE_UNREADABLE = JSON.stringify({ error: "Could not read that file from GitHub." })

/** The named skill as the catalogue holds it now, or the error to return. */
async function findSkill(name: string): Promise<{ skill: SkillEntry } | { error: string }> {
  const catalog = await loadSkillCatalogWithin()
  if (!catalog) return { error: UNAVAILABLE }
  if (catalog.sources.length === 0) return { error: NOT_CONFIGURED }
  // `skills` holds only the skills shown in the prompt; the rest are in `problems`
  const skill = catalog.skills.find((candidate) => candidate.name === name)
  return skill ? { skill } : { error: SKILL_NOT_FOUND }
}

/** The text cut to {@link MAX_CONTENT_CHARS}, and whether anything was cut. */
function capped(text: string) {
  // A high surrogate left last by the cut lost its pair; a lone surrogate is not valid Unicode for the provider
  return { content: text.slice(0, MAX_CONTENT_CHARS).replace(/[\uD800-\uDBFF]$/, ""), truncated: text.length > MAX_CONTENT_CHARS }
}

/** The `/` and `@` in `commit` keep the redactor from taking the full SHA for a secret, so the row stores it as is. */
function audit(toolName: string, skill: SkillEntry, path: string, userId: string | undefined) {
  logAuditEvent(AuditEventType.ASSISTANT_DATA_READ, userId ?? "unknown", {
    toolName,
    skill: skill.name,
    path,
    commit: `${skill.source.repo}@${skill.sha}`,
  })
}

async function loadSkill(skill: SkillEntry, userId: string | undefined): Promise<string> {
  // The catalogue read this file at the same commit, so this is usually a cache hit; after an eviction, one live read
  const read = await readDocResult(skill.source, skill.path)
  const parsed = read.ok ? parseSkillMarkdown(read.text) : null
  if (!parsed?.ok) {
    logger.warn("Skill could not be read", { skill: skill.name, reason: read.ok ? "invalid_frontmatter" : read.reason })
    return UNAVAILABLE
  }
  audit("load_skill", skill, skill.path, userId)
  return JSON.stringify({
    name: skill.name,
    source: skill.source.name,
    url: skill.url,
    ...capped(parsed.body),
    files: skill.files,
    filesTruncated: skill.filesTruncated,
  })
}

async function readSkillFile(skill: SkillEntry, path: string, userId: string | undefined): Promise<string> {
  if (!skill.files.includes(path)) return FILE_NOT_FOUND
  const repoPath = skill.folder ? `${skill.folder}/${path}` : path
  const read = await readDocResult(skill.source, repoPath)
  if (!read.ok) {
    logger.warn("Skill file could not be read", { skill: skill.name, path: repoPath, reason: read.reason })
    return FILE_UNREADABLE
  }
  audit("read_skill_file", skill, repoPath, userId)
  return JSON.stringify({ skill: skill.name, path, url: docUrl(skill.source, repoPath), ...capped(read.text) })
}

/**
 * Runs a skill tool for an admin. The arguments are checked before the
 * catalogue is loaded, so a malformed call never waits on GitHub.
 */
export async function executeSkillTool(toolName: string, args: Record<string, unknown>, userId?: string): Promise<string> {
  await assertAdmin()

  if (toolName === "load_skill") {
    const parsed = loadArgs.safeParse(args)
    if (!parsed.success) return INVALID_ARGUMENTS
    const found = await findSkill(parsed.data.name)
    return "error" in found ? found.error : loadSkill(found.skill, userId)
  }

  if (toolName === "read_skill_file") {
    const parsed = fileArgs.safeParse(args)
    if (!parsed.success) return INVALID_ARGUMENTS
    const found = await findSkill(parsed.data.skill)
    return "error" in found ? found.error : readSkillFile(found.skill, parsed.data.path, userId)
  }

  return "Error: Unknown tool"
}
