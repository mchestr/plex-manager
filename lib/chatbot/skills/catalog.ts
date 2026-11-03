import "server-only"

import { docUrl, isCommitSha, listDocsResult, readDocResult, resolveRef, type KnowledgeRepo } from "@/lib/chatbot/knowledge/github"
import type { SkillSource } from "@/lib/generated/prisma/client"
import { prisma } from "@/lib/prisma"

import { assignFiles, isSkillFile, skillFolder } from "./folders"
import { parseSkillMarkdown } from "./frontmatter"
import { withReadSlot } from "./pool"
import { SKILLS_HEADER, skillLine } from "./prompt"

/**
 * The skills the admin assistant can follow, read from the active skill
 * sources on GitHub, each source at one commit.
 *
 * ## Load
 *
 * 1. The active sources, in code-point order of their names.
 * 2. Per source, in parallel: resolve the ref to a commit SHA, then list the
 *    Markdown at that SHA, so what is listed, loaded and checked all comes
 *    from one commit.
 * 3. Every listed `SKILL.md`, in source then path order. The first
 *    {@link MAX_SKILL_READS} are read, at most 8 at a time across the process
 *    (`./pool`), and parsed; the rest are `not_read`.
 * 4. A name an earlier skill already took is a `duplicate_name`. Then the
 *    prompt budget: at the first skill whose line does not fit, it and every
 *    later skill are `not_in_prompt`, with no skipping ahead.
 *
 * Every listed `SKILL.md` marks a folder, whether or not it was read, parsed
 * or kept, so its documents never go to a skill around it. One bad source or
 * file never fails the load: each becomes a {@link SkillProblem}.
 *
 * @module lib/chatbot/skills/catalog
 */

export interface SkillEntry {
  name: string
  description: string
  /** At the resolved SHA, so it passes to the reader and `docUrl` as is. Carries the decrypted token: never log, audit or return it. */
  source: KnowledgeRepo & { name: string }
  /** The resolved commit, for the audit. */
  sha: string
  /** Repo path of the `SKILL.md`. */
  path: string
  /** Repo path of its folder, `""` only at the repo root. */
  folder: string
  /** Supporting paths relative to the folder, sorted, at most 50. */
  files: string[]
  filesTruncated: boolean
  /** `docUrl(source, path)`: the github.com page at the commit. */
  url: string
}

export interface SkillProblem {
  source: string
  path: string | null
  /** `too_long` is a warning: the skill is still listed. */
  reason: "invalid_frontmatter" | "duplicate_name" | "unreachable" | "rate_limited" | "not_read" | "not_in_prompt" | "listing_truncated" | "too_long"
  /** The winning source for `duplicate_name`; the parse reason for `invalid_frontmatter`. */
  detail?: string
}

export interface SkillCatalog {
  skills: SkillEntry[]
  problems: SkillProblem[]
  /** `sha` is null when the ref could not be resolved; `pinned` when the saved ref is a commit SHA. */
  sources: { id: string; name: string; sha: string | null; pinned: boolean }[]
}

/**
 * The SKILLS section's cap, header included.
 * @internal
 */
export const SKILL_PROMPT_BUDGET = 6_000
/**
 * `SKILL.md` files read per load; also the most skills a catalogue can hold.
 * @internal
 */
export const MAX_SKILL_READS = 50
/** Supporting files listed per skill, in path order, and so the ones `read_skill_file` can read. */
const MAX_LISTED_FILES = 50
/** What `load_skill` returns of a body; a longer one is listed with a `too_long` warning. */
const MAX_BODY_CHARS = 12_000

type Source = SkillEntry["source"]
type Reason = SkillProblem["reason"]

interface Listing {
  row: SkillSource
  sha: string | null
  /** Null when the ref or the listing could not be read. */
  source: Source | null
  paths: string[]
  problems: SkillProblem[]
}

const byCodePoint = (a: string, b: string) => (a < b ? -1 : 1)

/** One source's commit and listing, or why it could not be read. */
async function listSource(row: SkillSource): Promise<Listing> {
  const failed = (sha: string | null, reason: Reason): Listing => ({ row, sha, source: null, paths: [], problems: [{ source: row.name, path: null, reason }] })
  const ref = await resolveRef(row)
  if (!ref.ok) return failed(null, ref.reason)

  const source: Source = { id: row.id, name: row.name, repo: row.repo, ref: ref.sha, path: row.path, token: row.token, updatedAt: row.updatedAt }
  const listing = await listDocsResult(source)
  if (!listing.ok) return failed(ref.sha, listing.reason)
  const problems: SkillProblem[] = listing.truncated ? [{ source: row.name, path: null, reason: "listing_truncated" }] : []
  return { row, sha: ref.sha, source, paths: listing.paths, problems }
}

/** One `SKILL.md`, read in a process-wide slot; `null` when skipped after a timeout. */
function readSkill(source: Source, path: string, signal?: AbortSignal) {
  // The reader never rejects; if it ever does, that is one unreachable file, not a failed load
  return withReadSlot(() => readDocResult(source, path), signal).catch(() => ({ ok: false as const, reason: "unreachable" as const }))
}

/** The skills of every active source, at the commit each ref points at now. */
export async function loadSkillCatalog(signal?: AbortSignal): Promise<SkillCatalog> {
  // The orderBy is only a convenience: this code-point sort is the one that decides duplicate winners and the read cut, whatever the database's collation
  const rows = (await prisma.skillSource.findMany({ where: { isActive: true }, orderBy: { name: "asc" } })).toSorted((a, b) => byCodePoint(a.name, b.name))
  const listings = await Promise.all(rows.map(listSource))
  const problems = listings.flatMap((listing) => listing.problems)
  const problem = (source: Source, path: string, reason: Reason, detail?: string) =>
    problems.push({ source: source.name, path, reason, ...(detail === undefined ? {} : { detail }) })

  const candidates = listings.flatMap(({ source, paths }) => {
    if (!source) return []
    const skillPaths = paths.filter(isSkillFile).toSorted(byCodePoint)
    const folders = assignFiles(paths, skillPaths)
    return skillPaths.map((path) => ({ source, path, files: folders.get(skillFolder(path)) ?? [] }))
  })
  const texts = await Promise.all(candidates.slice(0, MAX_SKILL_READS).map(({ source, path }) => readSkill(source, path, signal)))

  const parsed: { entry: SkillEntry; long: boolean }[] = []
  for (const [i, { source, path, files }] of candidates.entries()) {
    // Undefined past the read cap; null when skipped after a timeout
    const text = texts[i]
    if (!text) problem(source, path, "not_read")
    else if (!text.ok) problem(source, path, text.reason === "rate_limited" ? "rate_limited" : "unreachable")
    else {
      const skill = parseSkillMarkdown(text.text)
      if (!skill.ok) problem(source, path, "invalid_frontmatter", skill.reason)
      else
        parsed.push({
          entry: {
            name: skill.name,
            description: skill.description,
            source,
            sha: source.ref,
            path,
            folder: skillFolder(path),
            files: files.slice(0, MAX_LISTED_FILES),
            filesTruncated: files.length > MAX_LISTED_FILES,
            url: docUrl(source, path),
          },
          long: skill.body.length > MAX_BODY_CHARS,
        })
    }
  }

  const winners = new Map<string, string>()
  const skills: SkillEntry[] = []
  const lines: string[] = []
  let full = false
  for (const { entry, long } of parsed) {
    const winner = winners.get(entry.name)
    if (winner !== undefined) {
      problem(entry.source, entry.path, "duplicate_name", winner)
      continue
    }
    winners.set(entry.name, entry.source.name)
    const line = skillLine(entry.name, entry.description)
    // Exactly the length skillsSection renders; once one skill does not fit, none after it is added
    full ||= SKILLS_HEADER.length + [...lines, line].join("\n").length > SKILL_PROMPT_BUDGET
    if (full) {
      problem(entry.source, entry.path, "not_in_prompt")
      continue
    }
    lines.push(line)
    skills.push(entry)
    if (long) problem(entry.source, entry.path, "too_long")
  }

  return { skills, problems, sources: listings.map(({ row, sha }) => ({ id: row.id, name: row.name, sha, pinned: isCommitSha(row.ref) })) }
}
