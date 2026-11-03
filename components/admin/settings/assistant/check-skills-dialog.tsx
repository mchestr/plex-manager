"use client"

import { useRef, useState } from "react"

import { checkSkills } from "@/actions/admin/assistant-skills"
import { Alert } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { NotSet, SettingsSummary, SettingsSummaryRow } from "@/components/ui/settings-summary"
import { Spinner } from "@/components/ui/spinner"
import type { SkillSourceSettings } from "@/lib/data/assistant-sources"

/** What `checkSkills` found across every active source: commits, skills and problems, never a token. */
type SkillCheck = Extract<Awaited<ReturnType<typeof checkSkills>>, { success: true }>["data"]
type SkillProblem = SkillCheck["problems"][number]
type CheckState = { status: "loading" } | { status: "failed"; error: string } | { status: "done"; check: SkillCheck }

/** For a call that never reached the action (the network); a refusal shows the action's own copy. */
const CHECK_FALLBACK_ERROR = "Could not check the skills. Try again."

/** Each reason as plain copy; a duplicate also names the source that won, in {@link problemCopy}. */
const PROBLEM_COPY: Record<Exclude<SkillProblem["reason"], "duplicate_name">, string> = {
  invalid_frontmatter: "Its SKILL.md frontmatter is not valid",
  unreachable: "Could not read the repository",
  rate_limited: "GitHub's rate limit was reached; add a token (it resets within the hour)",
  not_read: "Not read: only the first 50 SKILL.md files are read. Remove skills or set a folder.",
  not_in_prompt: "Left out: the skills list is full. Shorten descriptions or remove skills.",
  too_long: "Longer than 12,000 characters; the assistant reads only the start",
  listing_truncated: "Only the first 300 Markdown files were read; set a folder",
}

function problemCopy(problem: SkillProblem) {
  if (problem.reason === "duplicate_name") return `Hidden by a skill with the same name in ${problem.detail} (the source whose name sorts first wins)`
  return PROBLEM_COPY[problem.reason]
}

/**
 * One source's share of the check, matched by its name: the full commit its
 * ref resolves to (a short prefix can be ground to collide by anyone who can
 * push to the ref), whether that ref can move, the skills found and the
 * problems.
 */
function CheckResult({ source, check }: { source: SkillSourceSettings; check: SkillCheck }) {
  const entry = check.sources.find((item) => item.name === source.name)
  const skills = check.skills.filter((skill) => skill.source === source.name)
  const problems = check.problems.filter((problem) => problem.source === source.name)
  return (
    <SettingsSummary className="md:grid-cols-1">
      <SettingsSummaryRow label="Commit">
        <div className="flex flex-wrap items-center gap-2">
          {entry?.sha ? <span className="font-mono break-all">{entry.sha}</span> : <NotSet>Not read</NotSet>}
          {!(entry?.pinned ?? source.pinned) && <Badge variant="warning">Follows a moving ref</Badge>}
        </div>
      </SettingsSummaryRow>
      <SettingsSummaryRow label="Skills found">
        {skills.length === 0 ? (
          <NotSet>None</NotSet>
        ) : (
          <ul className="flex flex-col gap-1">
            {skills.map((skill) => (
              <li key={skill.path} className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-mono">{skill.name}</span>
                <span className="font-mono break-all text-label text-muted-foreground">{skill.path}</span>
              </li>
            ))}
          </ul>
        )}
      </SettingsSummaryRow>
      {problems.length > 0 && (
        <SettingsSummaryRow label="Problems">
          <ul className="flex flex-col gap-2">
            {problems.map((problem) => (
              <li key={`${problem.reason}:${problem.path ?? ""}`} className="flex flex-col">
                {problem.path && <span className="font-mono break-all text-label text-muted-foreground">{problem.path}</span>}
                <span>{problemCopy(problem)}</span>
                {problem.reason === "invalid_frontmatter" && problem.detail && <span className="text-label text-muted-foreground">{problem.detail}</span>}
              </li>
            ))}
          </ul>
        </SettingsSummaryRow>
      )}
    </SettingsSummary>
  )
}

function CheckBody({ source, state }: { source: SkillSourceSettings; state: CheckState }) {
  if (!source.isActive) return <p className="text-ui text-muted-foreground">This source is off, so the assistant does not read it.</p>
  if (state.status === "loading") {
    return (
      <p className="flex items-center gap-2 text-ui text-muted-foreground">
        <Spinner />
        Reading the skills from GitHub…
      </p>
    )
  }
  if (state.status === "failed") return <Alert tone="destructive">{state.error}</Alert>
  return <CheckResult source={source} check={state.check} />
}

/**
 * A row's Check skills: the dialog opens at once with a Spinner, and fills in
 * when `checkSkills` has read every active source (the full load, not the
 * chat's five-second bound), showing only this row's part. An Off source is
 * one the assistant does not read, so its dialog says so and checks nothing.
 */
export function CheckSkillsDialog({ source }: { source: SkillSourceSettings }) {
  const [state, setState] = useState<CheckState>({ status: "loading" })
  // Each open checks again, and only the latest check fills the dialog
  const latest = useRef(0)

  const check = async () => {
    const run = ++latest.current
    setState({ status: "loading" })
    let next: CheckState
    try {
      const result = await checkSkills()
      next = result.success ? { status: "done", check: result.data } : { status: "failed", error: result.error }
    } catch {
      next = { status: "failed", error: CHECK_FALLBACK_ERROR }
    }
    if (run === latest.current) setState(next)
  }

  return (
    <Dialog
      onOpenChange={(open) => {
        if (open && source.isActive) void check()
      }}
    >
      <DialogTrigger render={<Button variant="ghost" size="sm" data-testid="settings-skill-check" />}>
        Check skills
        <span className="sr-only"> in {source.name}</span>
      </DialogTrigger>
      <DialogContent data-testid="settings-skill-check-dialog">
        <DialogHeader>
          <DialogTitle>Skills in {source.name}</DialogTitle>
          <DialogDescription className="font-mono break-all">
            {source.repo}@{source.ref}
            {source.path && `/${source.path}`}
          </DialogDescription>
        </DialogHeader>
        <CheckBody source={source} state={state} />
      </DialogContent>
    </Dialog>
  )
}
