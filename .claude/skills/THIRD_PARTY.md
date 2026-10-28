# Vendored agent skills

Every folder in `.claude/skills/` is either a third-party skill copied in at a
pinned commit (or an exact npm version) after a line-by-line review, or a
project-authored skill (listed below). Nothing here is fetched or updated at
run time. `scripts/__tests__/vendored-skills.test.ts`
checks this table against the folders.

## Skills

| Skill | Upstream repository and path | Pinned at | Licence | Reviewed | Reviewer | Local changes |
|---|---|---|---|---|---|---|
| `frontend-design` | `anthropics/skills`, `skills/frontend-design` | `dbd4588f9e1033efb41dad4bef2f7947c8993d44` | Apache-2.0 (`LICENSE.txt`) | 2026-10-19 | Claude Code agent, P1.9 | Added `paths:`. |
| `accessibility-review` | `anthropics/knowledge-work-plugins`, `design/skills/accessibility-review` | `33eeda1e8fd856455b05479d13a0f85b5f803744` | Apache-2.0 (`LICENSE`, the repository's) | 2026-10-19 | Claude Code agent, P1.9 | Added `paths:`; removed the link to the plugin's `CONNECTORS.md`. The plugin's `.mcp.json` is not vendored. |
| `web-design-guidelines` | `vercel-labs/agent-skills`, `skills/web-design-guidelines` | `063bee94c3f4df8453406c830b0a7df0f2860278` | MIT (`LICENSE`, see its note) | 2026-10-19 | Claude Code agent, P1.9 | Reads `./guidelines/command.md` instead of fetching `main` with WebFetch; added `paths:`. |
| `web-design-guidelines/guidelines` | `vercel-labs/web-interface-guidelines`, `command.md` | `434b7f91364665f2f733b310ec54809bf8f37937` | MIT (`guidelines/LICENSE`, the repository's) | 2026-10-19 | Claude Code agent, P1.9 | None. `install.sh` is not vendored. |
| `vercel-react-best-practices` | `vercel-labs/agent-skills`, `skills/react-best-practices` | `063bee94c3f4df8453406c830b0a7df0f2860278` | MIT (`LICENSE`, see its note) | 2026-10-19 | Claude Code agent, P1.9 | Added `paths:`. Left out the contributor `README.md` and `metadata.json`. |
| `vercel-composition-patterns` | `vercel-labs/agent-skills`, `skills/composition-patterns` | `063bee94c3f4df8453406c830b0a7df0f2860278` | MIT (`LICENSE`, see its note) | 2026-10-19 | Claude Code agent, P1.9 | Added `paths:`. Left out the contributor `README.md` and `metadata.json`. |
| `vercel-react-view-transitions` | `vercel-labs/agent-skills`, `skills/react-view-transitions` | `063bee94c3f4df8453406c830b0a7df0f2860278` | MIT (`LICENSE`, see its note) | 2026-10-19 | Claude Code agent, P1.9 | Added `paths:`. Left out the `README.md` (an `npx skills add` install line) and `metadata.json`. |
| `motion` | npm `motion-ai`, `content/skills/motion/` | `motion-ai@14.2.0` | MIT (`LICENSE`, see its note) | 2026-10-19 | Claude Code agent, P1.9 | Added `paths:` (`components/rewind/**`, `lib/rewind/**`; `components/wrapped/**` removed by P11.26 after P11.29 deleted that folder); replaced the "Runtime audits" section of `performance-audit/index.md`, which ran `npx motionscore`. |

## Project-authored skills

These four are written in this repository (P11.27), not vendored, so they have
no upstream pin and fall under the repository's own `LICENSE`. They point at
the source files they describe instead of copying values, and
`scripts/__tests__/project-skills.test.ts` fails when a path, export, npm
script or Playwright project they name stops existing. Update the skill in the
same pull request as the code it describes.

| Skill | Source | Pinned at | Licence | Reviewed | Reviewer | Local changes |
|---|---|---|---|---|---|---|
| `rewind-design-system` | This repository, `.claude/skills/rewind-design-system` | project-authored | The repository's `LICENSE` | 2026-10-23 | Claude Code agent, P11.27 | Not applicable. |
| `rewind-page` | This repository, `.claude/skills/rewind-page` | project-authored | The repository's `LICENSE` | 2026-10-23 | Claude Code agent, P11.27 | Not applicable. |
| `share-card` | This repository, `.claude/skills/share-card` | project-authored | The repository's `LICENSE` | 2026-10-23 | Claude Code agent, P11.27 | Not applicable. |
| `visual-qa` | This repository, `.claude/skills/visual-qa` | project-authored | The repository's `LICENSE` | 2026-10-23 | Claude Code agent, P11.27 | Not applicable. |

The Vercel folders are renamed to their skill names (`react-best-practices`
becomes `vercel-react-best-practices`, and so on). None of the upstream `*.zip`
archives is vendored.

## Notes on fit

- **`accessibility-review` targets WCAG 2.1 AA.** The project bar is WCAG 2.2 AA.
  When using the skill, also check the 2.2 criteria it leaves out: 2.4.11
  Focus Not Obscured, 2.5.7 Dragging Movements,
  2.5.8 Target Size (Minimum), 3.2.6 Consistent Help, 3.3.7 Redundant Entry and
  3.3.8 Accessible Authentication. The skill is not patched for this.
- **`motion` is written for the `motion` package.** Its rule "never import from
  `framer-motion`" matches this codebase, which imports `motion/react` since
  P2.15. The
  skill's search, easing, transition-editor and MotionScore features need the
  hosted Motion MCP servers, which this project does not add; its
  `best-practices/` folder works without them.
- **`motion` provenance.** The files are byte-identical to
  `motiondivision/ai-kit` at `b7e2c68fb3b159b6c849d4d2c5c7a17b408689fc`
  (`plugins/motion/skills/motion/`), checked with `diff -r` on 2026-10-19. That
  repository has no licence, so the copy comes from the MIT npm tarball.
- **Project conventions win.** Some upstream examples differ from CLAUDE.md:
  `vercel-react-best-practices` suggests SWR (the project uses TanStack Query),
  an inline `dangerouslySetInnerHTML` script, and Server Actions that throw.
  `web-design-guidelines` asks for Title Case labels, while `frontend-design`
  asks for sentence case. Follow CLAUDE.md and the design system.

## Updating a skill

1. Take the new upstream SHA (or npm version). Never run `npx skills update` or
   `npx skills add` against these folders.
2. In a scratch directory outside the repository, make a partial, sparse clone
   at the new SHA, or `npm pack` the new version.
3. Review the upstream change: `git diff <old> <new> -- <path>`. Read every
   changed file, looking for `allowed-tools`, lines starting with `` !` ``,
   hooks, `scripts/` folders, binaries, archives and runtime URL fetches.
4. Copy the folder over, re-apply the local changes listed above, and keep the
   licence file.
5. Update this table (SHA, review date, reviewer, local changes) and run
   `npx jest scripts/__tests__/vendored-skills.test.ts`.
6. Run `/security-review` on the branch and paste its summary into the PR, as
   for every change to `.claude/skills/**` or `.mcp.json`.
