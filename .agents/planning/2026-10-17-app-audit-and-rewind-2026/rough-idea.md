# Rough Idea — Full App Audit, UI Refresh & Rewind 2026

Original request (2026-10-17):

> I want a full audit and ui refresh for the app to make it consistent modern and
> clean. Can you review the current app, identify security issues, improvements,
> code deduplication, best practises we are not following and create a plan to
> update to bring it up to spec. 2026 is almost over so I want to make the rewind
> way better than the current one, better visuals, better stats, more robust,
> consider newer models to create it. Research the internet if there are skills we
> can use to help generate visuals better.

## Parameters

- **Scope:** the whole app — `app/`, `actions/`, `components/`, `lib/`, `hooks/`,
  `types/`, `prisma/`, `e2e/`, CI, Docker.
- **Goals:**
  1. Security audit: find vulnerabilities and verify them against the code.
  2. Improvements and best practices: compare against `CLAUDE.md` and current
     Next.js 16 / React 19 practice.
  3. Code deduplication and dead-code removal.
  4. UI refresh: make every surface one consistent, modern, clean design system.
  5. **Rewind 2026** ("Wrapped"): better visuals, better stats, more robust
     generation, and newer LLM / generative models.
  6. Research Claude Code / Agent Skills (and related tooling) that help
     generate better visuals.
- **Deadline driver:** Rewind 2026 should be ready before late December 2026.
- **Terminology:** "Rewind" is the user-facing name of the existing "Wrapped"
  feature (`components/wrapped/`, `lib/wrapped/`, `PlexWrapped` model).
