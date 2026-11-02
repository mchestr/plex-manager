"use server"

/**
 * Skill sources for the admin assistant: GitHub repositories of Agent Skills
 * (`SKILL.md` folders) that the assistant lists and follows.
 *
 * A source's token goes only to api.github.com, so a blank one keeps the stored
 * token, and no result carries it. A commit SHA is saved in lowercase, so it
 * counts as pinned. Refresh only bumps `updatedAt`: a branch or tag resolves
 * again at once and a remembered rate limit is forgotten, while what was read
 * at a pinned commit is kept, since a commit cannot change. Every change is
 * audited as `ASSISTANT_SOURCE_CHANGED` with `kind: "skill"`, never with the
 * token.
 *
 * Like every action, these are `/api/mcp` tools: managing sources, as for
 * knowledge bases. The skill tools themselves (`load_skill`,
 * `read_skill_file`) are admin web chat only.
 *
 * @module actions/admin/assistant-skills
 */

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { adminAction } from "@/lib/actions/define-action"
import { fail, ok, type ActionResult } from "@/lib/actions/result"
import { isCommitSha } from "@/lib/chatbot/knowledge/github"
import { loadSkillCatalog, type SkillProblem } from "@/lib/chatbot/skills/catalog"
import { prisma } from "@/lib/prisma"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"
import { githubPath, githubRef, githubRepo } from "@/lib/validations/github-source"

const recordId = z.string().min(1).max(100)

const skillInput = z.object({
  id: recordId.optional(),
  name: z.string().trim().min(1, "Enter a name").max(60),
  repo: githubRepo,
  ref: githubRef,
  path: githubPath,
  /** Blank keeps the stored token. */
  token: z.string().max(500).optional(),
  isActive: z.boolean(),
})

/** What Check skills shows: names, commits, paths and problems, never a source row, which carries the token. */
interface SkillCheck {
  sources: { name: string; sha: string | null; pinned: boolean }[]
  skills: { name: string; source: string; path: string }[]
  problems: SkillProblem[]
}

const GONE = "That skill source no longer exists"

function changed(userId: string, action: "saved" | "deleted" | "refreshed", id: string) {
  logAuditEvent(AuditEventType.ASSISTANT_SOURCE_CHANGED, userId, { kind: "skill", action, id })
  revalidatePath("/admin/settings")
}

/** Add or change a skill source. */
export const saveSkillSource = adminAction({
  input: skillInput,
  rateLimit: { name: "admin" },
  fallbackError: "Could not save the skill source",
  handler: async (input, { userId }) => {
    const stored = input.id ? await prisma.skillSource.findUnique({ where: { id: input.id } }) : null
    if (input.id && !stored) return fail("NOT_FOUND", GONE)

    const clash = await prisma.skillSource.findFirst({ where: { name: input.name, NOT: { id: input.id ?? "" } }, select: { id: true } })
    if (clash) return fail("CONFLICT", "A skill source with that name already exists", { fieldErrors: { name: ["Already in use"] } })

    // isCommitSha matches lowercase only, so a SHA typed in capitals is still saved as the pinned commit it is
    const ref = isCommitSha(input.ref.toLowerCase()) ? input.ref.toLowerCase() : input.ref
    // The token goes only to api.github.com, so a blank one keeps the stored token
    const token = input.token?.trim() || stored?.token || null
    const data = { name: input.name, repo: input.repo, ref, path: input.path.replace(/^\/+|\/+$/g, ""), token, isActive: input.isActive }
    const row = input.id
      ? await prisma.skillSource.update({ where: { id: input.id }, data })
      : await prisma.skillSource.create({ data })
    changed(userId, "saved", row.id)
    return ok({ id: row.id })
  },
})

/** Remove a skill source. */
export const deleteSkillSource = adminAction({
  input: z.object({ id: recordId }),
  rateLimit: { name: "admin" },
  fallbackError: "Could not remove the skill source",
  handler: async ({ id }, { userId }) => {
    const { count } = await prisma.skillSource.deleteMany({ where: { id } })
    if (count === 0) return fail("NOT_FOUND", GONE)
    changed(userId, "deleted", id)
    return ok(null)
  },
})

/** Read a skill source's ref again now. */
export const refreshSkillSource = adminAction({
  input: z.object({ id: recordId }),
  rateLimit: { name: "admin" },
  fallbackError: "Could not refresh the skill source",
  handler: async ({ id }, { userId }) => {
    const stored = await prisma.skillSource.findUnique({ where: { id }, select: { id: true } })
    if (!stored) return fail("NOT_FOUND", GONE)
    // The ref's resolution and any remembered rate limit are keyed on updatedAt, so the next read asks GitHub again
    await prisma.skillSource.update({ where: { id }, data: { updatedAt: new Date() } })
    changed(userId, "refreshed", id)
    return ok(null)
  },
})

/** List the skills found and any problems. */
export const checkSkills = adminAction({
  rateLimit: { name: "admin" },
  fallbackError: "Could not check the skills",
  handler: async (): Promise<ActionResult<SkillCheck>> => {
    // The full load, not the chat's five-second bound: a diagnosis waits for every source's answer
    const catalog = await loadSkillCatalog()
    return ok({
      sources: catalog.sources.map(({ name, sha, pinned }) => ({ name, sha, pinned })),
      skills: catalog.skills.map((skill) => ({ name: skill.name, source: skill.source.name, path: skill.path })),
      problems: catalog.problems,
    })
  },
})
