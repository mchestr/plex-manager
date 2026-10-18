# Agent Skills and Tooling for Generating Better Visuals

- **Date:** 2026-10-17
- **Topic label:** visual-generation-skills
- **Applies to:** Plex Manager (`/home/user/plex-manager`): Next.js 16.1.1, React 19.2.3, Tailwind 4.3.2, framer-motion 12.42.2, chart.js 4, Playwright 1.57
- **Feeds:** the 2026-10-17 app audit, the UI refresh and Rewind 2026 planning

## Question

Which Claude Code / Agent Skills (SKILL.md skills and plugins), MCP servers and related agent tooling exist in late 2026 that would help us design and generate better visuals for:

1. a full UI refresh of a Next.js + Tailwind v4 app, and
2. a Spotify-Wrapped-style annual Rewind: animated story slides, data visualisation, share cards and images, and possibly video?

For each candidate this report gives the source, what it does, exact install steps, maintenance status, license, trust and supply-chain risk, and how this project would use it. It ends with a ranked shortlist and a vendoring procedure.

## TL;DR

- **Vendor a few instruction-only skills into `.claude/skills/`, each pinned to a commit.** They are the cheapest win. Pick Anthropic `frontend-design` (Apache-2.0), Vercel `web-design-guidelines`, `react-best-practices`, `composition-patterns` and `react-view-transitions` (MIT), and Motion's `motion` skill (MIT). None of them needs hooks or a long-running process. Cloud sessions load `.claude/skills/` from the repo, but they do **not** install plugins that `.claude/settings.json` enables. Vendoring is therefore the only way that works on every surface.
- **The biggest visual-tooling gap is the lack of screenshot baselines.** The repo has Playwright 1.57 and axe, but no `toHaveScreenshot()`. Add a `visual` Playwright project, plus a project skill that tells agents how to run it. Use `playwright-cli` skills, Playwright MCP or Chrome DevTools MCP only as the agent's "eyes" at dev time.
- **Rewind slides should stay on Motion (`framer-motion`/`motion`), with View Transitions between routes.** Use Remotion only if MP4 export is a hard requirement. Its official skills are good, but every animation in a composition must be driven by `useCurrentFrame()`, so the video becomes a second component tree. Its license is source-available: free for individuals, for-profit organisations with up to 3 employees, and non-profits. Its in-browser renderer (`@remotion/web-renderer`) is documented as stable since 4.0.491, but it supports only a subset of HTML/CSS and needs WebCodecs. HyperFrames (HeyGen, Apache-2.0) is the permissively licensed alternative, but it needs Chrome and FFmpeg on the server.
- **Use image generation at dev time only, for a fixed asset set.** Examples are the 12 archetype illustrations, backgrounds and empty states. Do not generate per-user images at runtime, because of cost, latency and sending watch history to a third party. Current models:
  - OpenAI `gpt-image-2` and `gpt-image-2.5-sunburst`/`-flare` (model IDs confirmed in the official `openai-python` SDK). `gpt-image-1` shuts down on 2026-10-23.
  - Google Nano Banana 2.1 (GA 2026-10-06). Imagen 4 is retired.
  - BFL FLUX.2.

  The fal, BFL FLUX and Replicate MCP servers are all first-party. Add them at **user** scope and never commit keys.
- **Three tools only make sense if a design-phase decision goes their way.**
  - The shadcn skill and MCP help only if the refresh adopts shadcn. Today the repo has its own `components/ui/*` and no `components.json`.
  - The Figma MCP helps only if designs live in Figma. Starter and View seats are capped at 6 tool calls a month.
  - Next.js `next-dev-loop` needs Next 16.3+ on Turbopack. The repo is on 16.1.1, and the latest release is 16.4.2.
- **Skip these:**
  - `web-artifacts-builder`: targets claude.ai artifacts with React 18 and Tailwind 3.4.
  - `canvas-design` and `algorithmic-art`: only useful for one-off static art.
  - Anthropic `webapp-testing`: uses Python Playwright, and we already have TypeScript Playwright.
  - Axe MCP: needs a paid Deque subscription.
  - lost-pixel: archived.
  - Community repackagings of official skills, such as `remotion-skills-marketplace`.
  - Unaudited single-author image MCPs.
- **The design phase should rule on our theme.** `frontend-design` lists these as generic "generated page" tells:
  - a near-black background with a single bright accent (the skill names "acid-green or vermilion");
  - a tinted near-black (`#0B0B0B`, `#111`) standing in for black;
  - a tracked-out ALL-CAPS eyebrow above headings;
  - a single highlighted word in a headline.

  The current Cinematic Premiere theme matches all four, the first by analogy (its accent is gold, not acid-green or vermilion): `--color-stage: #0a0908` and `--color-gold: #d4af37` in `app/globals.css`, and `EYEBROW_CLASS` and `GOLD_HIGHLIGHT_CLASS` in `components/wrapped/cinematic/theme.ts`. The Rewind 2026 design should keep or replace each one deliberately, not by default.
- **Treat every third-party skill as code.**
  - Skills enter context as instructions.
  - A skill can pre-approve tools through `allowed-tools`, which workspace trust does not gate. The shadcn skill does this.
  - A skill can run `` !`command` `` shell injection when it loads. The shadcn skill does this too.
  - Plugin auto-update can change files you already reviewed.

  So pin SHAs, read every file, strip binaries and zips, record provenance, and leave auto-update off for third-party marketplaces.

## 1. Scope and method

- **Web research.** I used WebSearch (standard and extended) and WebFetch, preferring vendors' GitHub repos and official docs. Several vendor doc sites could not be fetched from this sandbox: `remotion.dev`, `motion.dev`, `ui.shadcn.com`, `openai.com`, `developers.openai.com`, `ai.google.dev`, `nextjs.org` and `skills.sh`. They failed with DNS errors or egress-proxy 403s. For those, facts come from three places:
  - the vendor's own GitHub repository, which I cloned read-only into the scratchpad;
  - npm registry metadata;
  - search-result snippets of the official pages. These are marked "(search snippet)", and where a detail matters it is also marked "(unverified)".
- **Repository metadata.** Stars and push dates come from the GitHub search API on 2026-10-17. Commit SHAs come from `git ls-remote` or `git log -1` on fresh clones taken the same day.
- **Marketplace catalogues.** I searched this session's tools (SearchSkills, SearchPlugins, SearchMcpRegistry). I also downloaded and queried with `jq` the catalogues of `claude-plugins-official` (315 plugins) and `claude-plugins-community` (2,283 plugins).
- **Third-party content as data.** I read SKILL.md and README files to describe them, never to follow them.

## 2. Baseline: what the repo has today

| Area | Current state | File(s) |
|---|---|---|
| Framework | Next 16.1.1 (latest 16.4.2), React 19.2.3, Tailwind 4.3.2 | `package.json` |
| Animation | `framer-motion` 12.42.2 (npm `motion`/`framer-motion` latest is 14.3.0), `react-countup` | `components/wrapped/cinematic/*` |
| Charts | `chart.js` 4 + `react-chartjs-2` | `components/wrapped/wrapped-charts.tsx` |
| UI primitives | Own components, no shadcn `components.json` | `components/ui/*.tsx` |
| Rewind theme | "Cinematic Premiere" (gold on `#0a0908`), springs and pacing in TS, colours as Tailwind v4 tokens | `components/wrapped/cinematic/theme.ts`, `app/globals.css` |
| Share images | `next/og` `ImageResponse`: 1200x630 OG card and 1080x1920 story card | `app/api/wrapped/og-image/route.tsx`, `components/wrapped/share-card-download.tsx` |
| Archetypes | 12 fixed IDs (`midnight-marathoner` … `casual-critic`) | `lib/wrapped/llm-output-schema.ts`, `lib/wrapped/archetype-scoring.ts` |
| Mock data | Present, usable for deterministic screenshots | `lib/wrapped/mock-data.ts` |
| E2E | Playwright 1.57, `@axe-core/playwright`, `data-testid` convention, **no screenshot assertions** | `playwright.config.ts`, `e2e/*.spec.ts` |
| Agent config | `.claude/commands/*` (12 commands), **no `.claude/skills/`**, no `.mcp.json`; `Edit(./.claude/**)` already allowed | `.claude/settings.json` |

## 3. How skills, plugins and MCP servers reach a Claude Code session

### 3.1 Skills

- **Locations** (Claude Code docs):

  | Scope | Path |
  |---|---|
  | Personal | `~/.claude/skills/<name>/SKILL.md` |
  | Project, committed | `.claude/skills/<name>/SKILL.md` |
  | Nested | `<subdir>/.claude/skills/` |
  | Plugin | `<plugin>/skills/<name>/SKILL.md`, invoked as `/plugin:skill` |

  When names collide, enterprise beats personal and personal beats project.
- **Frontmatter fields:**
  - `name` and `description`. The description is what triggers auto-loading; the combined `description` and `when_to_use` text is truncated at 1,536 characters in the listing.
  - `when_to_use`.
  - `disable-model-invocation`, which makes the skill user-only.
  - `user-invocable: false`, which makes it model-only.
  - `allowed-tools`, which pre-approves tools for that turn.
  - `disallowed-tools`.
  - `context: fork` with `agent`.
  - `paths`, which restricts auto-loading to matching files.
  - `model` and `effort`.
- **Security-relevant behaviour (docs):**
  - Workspace trust does not gate `allowed-tools`, so a checked-in skill can pre-approve broad tool access.
  - `` !`command` `` lines run on your machine before Claude reads the skill. Setting `"disableSkillShellExecution": true` blocks them.
  - `Skill(name)` permission rules and `skillOverrides` can allow, deny or hide individual skills.

### 3.2 Plugins and marketplaces

- **Adding a marketplace:** `/plugin marketplace add owner/repo`. Append `#ref` to pin a branch or tag, e.g. `/plugin marketplace add your-org/plugins#v1.2.0`.
- **Installing:** `/plugin install <plugin>@<marketplace>`, or from a shell `claude plugin install <plugin>@<marketplace> --scope project`.
- **Pinning:**
  - A marketplace entry can pin a plugin with `{"source":"github","repo":"…","ref":"…","sha":"<40-char sha>"}`.
  - The official `claude-plugins-official` catalogue pins external plugins by SHA, e.g. `figma`, `chrome-devtools-mcp` and `hyperframes`.
  - The community catalogue (`claude-community`, repo `anthropics/claude-plugins-community`) pins nearly every entry to a SHA, and Claude Code refuses a different commit.
- **Auto-update defaults:**
  - On for `claude-plugins-official` and the other official marketplace names, **except** `knowledge-work-plugins` and `first-party-plugins`, plus marketplaces added from claude.ai.
  - Off for community and third-party marketplaces.
  - When it is on, files you reviewed can change on disk.
- **Plugin capabilities:**
  - Plugins can ship hooks, monitors, MCP/LSP servers and a `bin/` directory on `PATH`.
  - Hooks and servers run outside the sandbox with your user permissions.
  - Skills and agents enter context as instructions.
- **Inspecting before install:** run `claude --plugin-dir <dir> plugin details <name>`.

### 3.3 MCP servers

- **Project scope:** `claude mcp add --scope project …` writes `.mcp.json`, which is committed and loaded in cloud sessions that have one repository.
- **Local or user scope:** writes `~/.claude.json` and stays on the machine.
- **Secrets:** servers that need API keys or OAuth (image generation, Figma, Argos) belong at user scope.

### 3.4 Cloud sessions (key constraint for this project)

Per the "What carries over from your setup" table in the cloud-environments docs:

| Item | Loaded in a cloud session? |
|---|---|
| Repo `.claude/skills/`, `.claude/agents/`, `.claude/commands/` | Yes |
| Repo `.mcp.json` | Yes, in a session with one repository |
| Plugins and marketplaces declared in repo `.claude/settings.json` (`enabledPlugins`, `extraKnownMarketplaces`) | **No** |
| User `~/.claude/skills`, user plugins | No |
| Skills enabled on the claude.ai account | Yes, loaded automatically |

**Implication:** anything we want every agent to have, including the workflow agents that produce these planning docs, must be **vendored into `.claude/skills/`**. Plugin installs are a per-developer convenience only.

### 3.5 The `npx skills` CLI (vercel-labs/skills)

- **Project install:** `npx skills add <owner/repo> --skill <name> -a claude-code` writes to `.claude/skills/`. Add `-g` to install into `~/.claude/skills/` instead.
- **Copy vs symlink:** symlink is the default; `--copy` copies the files.
- **Telemetry:** anonymous by default; disable with `DISABLE_TELEMETRY=1` or `DO_NOT_TRACK=1`.
- **Pinning:** no ref or commit flag is documented. Tree URLs such as `https://github.com/<o>/<r>/tree/<ref>/skills/<name>` are accepted, but I did not confirm that a commit SHA works there (unverified).
- **Recommendation:** for this repo, vendor with git at a SHA (section 7.1) instead of using the CLI.
- **Metadata:** CLI version 1.7.2 (2026-10-09). The repo has about 35.3k stars and is MIT-licensed. skills.sh is its discovery directory and ranks skills by install counts.
- **Automated audits:** at install time the CLI fetches and prints partner audit results from skills.sh for each skill: a risk label from Gen, an alert count from Socket and a risk label from Snyk (`src/add.ts`, `src/telemetry.ts`). These requests are skipped when telemetry is disabled. They are automated scans, not a substitute for reading the files ourselves (7.1).

## 4. Candidate catalogue

Legend for **Trust**:

- **Low risk:** instruction-only markdown from a first-party vendor.
- **Medium:** first-party but runs commands or reaches hosted services, or third-party instructions only.
- **High:** third-party code, hooks, binaries, or remote content fetched at runtime.

### 4.1 Design direction and UI refresh

#### 4.1.1 Anthropic `frontend-design` (skill)

- **Source:**
  - [github.com/anthropics/skills/tree/main/skills/frontend-design](https://github.com/anthropics/skills/tree/main/skills/frontend-design)
  - the same skill as the `frontend-design` plugin in `claude-plugins-official` (`./plugins/frontend-design`)
- **What it does:**
  - Casts the agent as a design lead.
  - Grounds choices in the subject matter.
  - Uses a two-pass process: first a compact token plan (4 to 6 named hex colours, typefaces and roles, ASCII wireframes, principles), then a review of that plan against "AI default" tells before writing code.
  - Gives guidance on restraint (one orchestrated motion moment, respect reduced motion) and on UX writing.
  - Explicitly lists generic tells, including a near-black background with a single bright acid-green or vermilion accent, tinted near-black `#0B0B0B`/`#111`, ALL-CAPS tracked eyebrows, single-word headline accents and the "SaaS card kit".
- **Install:**
  - Plugin: `/plugin install frontend-design@claude-plugins-official`
  - Bundle: `/plugin marketplace add anthropics/skills`, then `/plugin install example-skills@anthropic-agent-skills`. This installs all 12 example skills, which is too broad.
  - Vendor (recommended): copy `skills/frontend-design/` at commit `dbd4588f9e1033efb41dad4bef2f7947c8993d44` (2026-10-09).
- **Maintenance:** `anthropics/skills` has about 181.7k stars; last push 2026-10-09.
- **License:** Apache-2.0 (`LICENSE.txt` in the skill folder).
- **Trust:** low. It is 71 lines of markdown with no scripts, no `allowed-tools` and no shell injection.
- **Use here:**
  - Run it at the start of the UI-refresh design and the Rewind 2026 design to produce a token plan for `app/globals.css` (`@theme`) and the Rewind theme.
  - Use its critique checklist on each redesigned surface, with screenshots.
  - Feed its "tells" list into the design review of the current Cinematic Premiere theme (see the TL;DR).

#### 4.1.2 Other Anthropic example skills (assessed)

Source: [github.com/anthropics/skills](https://github.com/anthropics/skills). All are Apache-2.0 at commit `dbd4588f`.

| Skill | What it does | Fit for this project |
|---|---|---|
| `theme-factory` | 10 preset palettes and font pairings with a showcase PDF; can generate a custom theme | Low. Aimed at slides and docs; presets are generic. Useful only as inspiration. |
| `canvas-design` | Writes a "design philosophy" .md, then a single-page PNG/PDF poster; ships a `canvas-fonts/` directory | Low to medium. Could make a static Rewind 2026 announcement poster. Not for app UI. |
| `algorithmic-art` | p5.js 1.7.0 generative art with seeded randomness, in a fixed HTML viewer template | Low to medium. Could prototype generative backgrounds per archetype; would need a port to Canvas/WebGL or SVG in React. Viewer template carries Anthropic branding. |
| `brand-guidelines` | Anthropic's own colours and fonts | Template only. Copy its structure to write our own `rewind-brand` skill. |
| `web-artifacts-builder` | Scaffolds React 18 + Vite + Tailwind 3.4.1 + shadcn and bundles a single HTML file for claude.ai artifacts; ships `scripts/*.sh` and a `shadcn-components.tar.gz` binary | Do not use. Wrong target and stack, and it ships a binary. |
| `slack-gif-creator` | Pillow-based GIF builder with easing helpers, sized for Slack | Low. Possible "animated share GIF" prototype, but the Python dependency does not fit the stack. |
| `webapp-testing` | Python Playwright scripts plus `scripts/with_server.py` | Low. We already have TypeScript Playwright. See 4.6. |

#### 4.1.3 Vercel `agent-skills`

- **Source:** [github.com/vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills)
- **What it does:** four skills are relevant.
  - `web-design-guidelines` reviews UI code against Vercel's Web Interface Guidelines and outputs terse `file:line` findings. **It fetches the rules at runtime** from `https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md`.
  - `vercel-react-best-practices` gives React and Next.js performance rules ranked by impact.
  - `vercel-composition-patterns` covers compound components and avoiding boolean-prop sprawl.
  - `vercel-react-view-transitions` covers `<ViewTransition>`, `addTransitionType`, Next.js `transitionTypes` on `next/link` and `useRouter`, and reduced-motion CSS. Its caveats:
    - `transitionTypes` on `next/link` shipped in Next.js 16.2.0, so on our 16.1.1 the skill's documented fallback (`startTransition` + `addTransitionType` + `router.push()`) applies until we upgrade;
    - per-item staggered animation during navigation is not available in Next.js yet;
    - `router.back()` carries no transition type;
    - browsers needed: Chromium 125+, Firefox 144+, Safari 18.2+.
- **Install:**
  - CLI: `npx skills add vercel-labs/agent-skills --skill web-design-guidelines -a claude-code`, and the same for each other skill.
  - Vendor (recommended): copy each skill folder at commit `063bee94c3f4df8453406c830b0a7df0f2860278` (2026-08-28). Do **not** copy the `*.zip` files in `skills/`.
- **Maintenance:**
  - About 32.6k stars.
  - The last commit on `main` was 2026-08-28; the repo was pushed on 2026-10-14.
  - `web-interface-guidelines` HEAD is `434b7f91364665f2f733b310ec54809bf8f37937`.
- **License:** MIT, per the README's License section. The frontmatter of `react-best-practices`, `composition-patterns` and `react-view-transitions` also says `license: MIT`; `web-design-guidelines` has no license field. GitHub detects no license file at repo level. The `vercel-labs/web-interface-guidelines` repo (the source of `command.md`) does ship an MIT `LICENSE` file.
- **Trust:**
  - Low for `react-best-practices`, `composition-patterns` and `react-view-transitions`, which are markdown-only.
  - **High for `web-design-guidelines` as shipped**, because its rules are fetched from `main` each time. Patch it: vendor `command.md` at the SHA above and point the skill at the local copy.
- **Use here:**
  - Audit pass over `components/ui/*`, `app/admin/**`, `components/admin/**` and `components/wrapped/**` for the UI refresh. Turn the findings into issues with `/create-issues`.
  - Performance review of the client-heavy Rewind viewer: `components/wrapped/wrapped-viewer.tsx`, `user-wrapped-viewer.tsx`, `wrapped-charts.tsx`.
  - Refactor `components/ui` primitives toward variants and composition.
  - View transitions between app routes, and between the Rewind intro and outro pages.

#### 4.1.4 shadcn/ui skill, MCP server and registries

- **Source:**
  - skill at [github.com/shadcn-ui/ui/tree/main/skills/shadcn](https://github.com/shadcn-ui/ui/tree/main/skills/shadcn);
  - a `migrate-radix-to-base` skill alongside it;
  - docs at ui.shadcn.com/docs/skills and /docs/mcp (search snippet; docs site not fetchable here; MCP setup read from the repo's `apps/v4/content/docs/(root)/mcp.mdx`).
- **What it does:**
  - The skill injects `npx shadcn@latest info --json` (framework, Tailwind version, aliases, installed components, base library) into context.
  - It enforces shadcn styling rules: semantic colours, `gap-*`, `size-*`, `cn()`.
  - It covers Base UI vs Radix differences, presets, and building a design system from a `DESIGN.md`.
  - The MCP server lets the agent browse, search and install components from the default registry, any shadcn-compatible third-party registry, and private or namespaced registries configured in `components.json`. (The current `mcp.mdx` names no specific third-party registries.)
  - The skill's frontmatter sets `user-invocable: false`, so it loads only when Claude decides it applies.
- **Install:**
  - Skill: `npx skills add shadcn/ui`
  - MCP: `npx shadcn@latest mcp init --client claude`, or add this to `.mcp.json`:

    ```json
    { "mcpServers": { "shadcn": { "command": "npx", "args": ["shadcn@latest", "mcp"] } } }
    ```
- **Maintenance:** about 125.8k stars; last push 2026-10-17; skill HEAD `d2fba50ee5b9113008b5bb908563527b7efd2f27`. The shadcn CLI is at 4.22.0 (2026-10-16).
- **License:** MIT.
- **Trust:** medium.
  - `allowed-tools: Bash(npx shadcn@latest *)`, plus pnpm and bunx variants, pre-approves an **unpinned** npm package.
  - The `!` injection runs that package every time the skill loads.
  - The skill folder includes `scripts/showcase-coverage.mjs`.
  - If vendored, pin `shadcn@4.22.0` in both places.
- **Use here:** conditional. It is only useful if the UI-refresh design decides to move `components/ui/*` onto shadcn (Base UI or Radix) with a `components.json`. If we keep our own primitives, the skill does not trigger. Its `DESIGN.md` workflow is still a good model for our own design-system doc.

#### 4.1.5 Anthropic `design` plugin (knowledge-work-plugins)

- **Source:**
  - [github.com/anthropics/knowledge-work-plugins/tree/main/design](https://github.com/anthropics/knowledge-work-plugins/tree/main/design)
  - also listed in the claude.ai "Anthropic Directory" (publisher tier: Anthropic)
- **What it does:** seven skills and no separate `commands/` directory at the current HEAD: `accessibility-review` (WCAG 2.1 AA), `design-critique`, `design-handoff`, `design-system`, `research-synthesis`, `user-research` and `ux-copy`. As plugin skills they are invoked as `/design:<skill>`.
- **Install:** `/plugin marketplace add anthropics/knowledge-work-plugins`, then `/plugin install design@knowledge-work-plugins`. The marketplace name is a reserved official one, and the repo's `marketplace.json` lists the plugin as `design` (source `./design`). Unlike `claude-plugins-official`, this marketplace has auto-update **off** by default.
- **Maintenance:** about 30.0k stars; last push 2026-10-17.
- **License:** Apache-2.0 (repo).
- **Trust:** medium.
  - The skills are markdown.
  - The plugin's `.mcp.json` declares **nine hosted connectors**: Slack, Figma, Linear, Asana, Atlassian, Notion, Intercom, Google Calendar and Gmail. We need none of them.
- **Use here:** vendor only `accessibility-review` and `design-critique` as skills, without the `.mcp.json`. Use them during the UI refresh to complement the automated axe scans in `e2e/accessibility.spec.ts`.

#### 4.1.6 Figma MCP server (official)

- **Source:**
  - [github.com/figma/mcp-server-guide](https://github.com/figma/mcp-server-guide)
  - remote server `https://mcp.figma.com/mcp`
- **What it does:**
  - `get_design_context` returns React + Tailwind for a selection.
  - `get_variable_defs` returns design tokens.
  - Also: `get_screenshot`, `get_metadata`, Code Connect mapping, write-to-canvas (beta) and `generate_image` / `upload_assets`.
  - It bundles agent skills for implementing designs and creating design-system rules.
- **Install:**
  - Plugin: `claude plugin install figma@claude-plugins-official`. The official catalogue pins it to `f2789420e7e8b4e2465dfeb1e12e1fc6a31397e5`.
  - Or: `claude mcp add --transport http figma https://mcp.figma.com/mcp`, then authenticate via `/mcp`.
- **Maintenance:** guide repo has about 2.1k stars; last push 2026-10-15.
- **License:** the guide repo has no license detected. The server is a Figma service under Figma's terms.
- **Trust:** medium. It is a hosted first-party service with OAuth. Rate limits apply to tools that read from Figma; some write tools are exempt:
  - Starter plans and View or Collab seats on paid plans: up to 6 tool calls a month.
  - Dev or Full seats on Professional, Organization or Enterprise plans: per-minute limits (Tier 1 REST API limits).
- **Use here:** only if the owner designs the refresh in Figma. Otherwise skip. Tokens from `get_variable_defs` would map onto `app/globals.css` `@theme`.

#### 4.1.7 Next.js agent skills (`vercel/next.js`)

- **Source:** [github.com/vercel/next.js/tree/canary/skills](https://github.com/vercel/next.js/tree/canary/skills). Skills there include:
  - `next-dev-loop`
  - `next-bundle-optimizer`
  - `next-cache-components-adoption` and `-optimizer`
  - `next-partial-prefetching-adoption` and `-optimizer`

  The Next 16.3 announcement says the older "knowledge" skills are retired in favour of version-matched bundled docs delivered through a managed `AGENTS.md` block (search snippet of nextjs.org). The AI-agents guide bundled in `next@16.4.2` (`dist/docs/01-app/02-guides/ai-agents.md`) confirms it: "Framework knowledge comes from the bundled docs, not from Skills". It also says that from 16.3, when `next dev` detects a coding agent it creates or updates a managed block in the root `AGENTS.md`, configurable or disabled via the `agentRules` option. Next 16.2 bundles the docs without the managed block.
- **What it does:**
  - `next-dev-loop` verifies a change in the running app.
  - It uses the framework's `/_next/mcp` endpoint (routes, server actions, logs, errors) together with `agent-browser` 0.31.1+ for DOM, console, network and React-tree checks.
  - It **requires Next.js 16.3+ on Turbopack** and refuses webpack.
- **Install:**
  1. `npx next upgrade`
  2. `npm i -g agent-browser@latest` (0.39.1 on npm, 2026-10-13)
  3. `npx skills add vercel/next.js --skill next-dev-loop`
- **Maintenance:** about 143k stars; MIT; very active.
- **Trust:** medium. First-party, but it drives a global CLI and a browser.
- **Use here:** only after the Next upgrade that the audit will likely recommend (16.1.1 to 16.4.x). After that it is a good "did the slide actually render" loop for agents. `next-devtools-mcp` (`npx -y next-devtools-mcp@latest` in `.mcp.json`; npm 0.4.0, 2026-06-24, MIT) is the MCP form of the same introspection (search snippet). Because the repo has no `AGENTS.md` today, plan for `next dev` to create one after the upgrade, and decide whether to commit it or turn it off with `agentRules`.

#### 4.1.8 Seen and not recommended for this project

| Candidate | Why not |
|---|---|
| `superdesign` (official catalogue, pinned SHA; superdesigndev/superdesign-skill, about 0.8k stars) | Needs the hosted Superdesign canvas and account; design drafts live outside the repo. |
| `anti-slop-ui`, `ui-consistency`, `design-with-claude`, `get-design-done` (community) | Single-author instruction packs. `ui-consistency` also ships a `SessionStart` hook. They overlap with `frontend-design` plus Vercel guidelines. |
| Google `stitch-skills` (`google-labs-code/stitch-skills`; Apache-2.0, about 8.5k stars, last push 2026-08-17) | Built around the Stitch MCP and design canvas. Its `design-md` idea is useful, but the skills are not. |
| Icons8, Streamline, Supericons, Fluenticons plugins | We standardise on `lucide-react`. They add a hosted MCP for little gain. |
| Canva MCP plugin, Adobe for Creativity | Marketing-asset tools, not app UI. |
| Magic UI MCP (`magicuidesign/mcp`, about 0.2k stars), React Bits (about 49.5k), Motion Primitives (about 6.7k) | **Component sources, not skills.** Copy individual components (number ticker, marquee, particles) through the shadcn registry or by hand after review. No MCP needed. |

### 4.2 Animation and motion

#### 4.2.1 Motion AI Kit (`motion` skill and hosted MCP)

- **Source:** [github.com/motiondivision/ai-kit](https://github.com/motiondivision/ai-kit). The skill lives at `plugins/motion/skills/motion/`. Docs are at motion.dev/docs/ai-kit (search snippet; site not fetchable here).
- **What it does:** one `/motion` skill with sub-guides:
  - best practices for vanilla JS, React, Vue, Base UI and Radix, including "CSS or Motion";
  - docs and example search;
  - CSS spring and bounce generation (`linear()` easing);
  - MotionScore performance audits (Motion+, paid);
  - a transition-preview editor (Motion+);
  - a version-upgrade path, which matters because we are on `framer-motion` 12.42.2 and npm latest is 14.3.0.

  The plugin's `mcp.json` declares two hosted servers: `https://mcp.motion.dev` (free, no account; carries `search-motion-docs` and `generate-css-easing`) and `https://mcp.motion.dev/plus` (Motion+ sign-in). The docs/example search and CSS spring generation sub-guides call those free MCP tools, so a vendored copy without the MCP gives the best-practice guides only.
- **Install:**
  - Installer: `npx motion-ai` (v14.2.0, 2026-10-15). It is interactive: it asks for project or global scope and which agents, then writes the skill and MCP configuration.
  - Vendor (recommended): copy `content/skills/motion/` from the `motion-ai@14.2.0` npm tarball. Its files are byte-identical to `plugins/motion/skills/motion/` at ai-kit commit `b7e2c68fb3b159b6c849d4d2c5c7a17b408689fc` (2026-10-15), and the package declares `"license": "MIT"`, which the git repo does not. Add the free MCP at user scope if docs search and spring generation are wanted.
- **Maintenance:** the ai-kit repo is new (created 2026-07-27, about 39 stars) but comes from the Motion author, Matt Perry. The `motion` library has about 34.2k stars and is very active.
- **License:** `motion-ai` package is MIT. The ai-kit repo has no LICENSE file and its `package.json` has `"license": null`.
- **Trust:** low for the vendored markdown skill. Medium for the hosted MCPs, which are third-party services.
- **Use here:**
  - Slide choreography in `components/wrapped/wrapped-sections/**` and `components/wrapped/cinematic/**`: springs (replacing hand-tuned `REVEAL_SPRING`), layout animations, exit transitions and reduced-motion handling.
  - Planning the `framer-motion` 12 to `motion` 14 upgrade.
  - Code-level performance review of the slide deck, even without Motion+.

#### 4.2.2 React View Transitions

See 4.1.3 (`vercel-react-view-transitions`). Use it for route-level and page-level transitions; keep Motion for in-slide animation.

### 4.3 Data visualisation

| Candidate | Source | What it does | Status / license | Assessment |
|---|---|---|---|---|
| `dataviz` (session-provided skill) | Available in this Claude Code environment; not on disk and not vendorable | Form heuristic, colour formula with validator, mark specs and interaction rules for any chart medium, including React | Anthropic-provided in this session | **Use during design** of Rewind stat slides and admin dashboards. Nothing to install. |
| `claude-d3js-skill` | [github.com/chrisvoncsefalvay/claude-d3js-skill](https://github.com/chrisvoncsefalvay/claude-d3js-skill) | D3.js guidance | About 243 stars, last commit 2025-10-17 (no pushes since 2025-10-18), single author, no license detected | Third-party instructions only. Low value over D3 docs. |
| `d3-viz`, `tufte-claude-skill`, `data-visualizer` (community aggregators) | Listed on claudeskills.info, sourcepulse, claudemarketplaces (aggregator pages) | D3/Recharts chart recipes | Unverified authorship, star counts disagree across mirrors | Do not install. Write our own project skill instead (7.3). |

**Library note (for the Rewind design, not a skill):** for animated, bespoke story charts, `visx` (about 21.1k stars) or hand-rolled SVG animated by Motion give more control than chart.js canvas. Recharts (about 27.6k stars) fits admin dashboards. The UI design doc should decide whether chart.js stays.

### 4.4 Video

#### 4.4.1 Remotion Agent Skills and Claude Code plugin (official)

- **Source:**
  - [github.com/remotion-dev/skills](https://github.com/remotion-dev/skills): 12 skills, including `remotion-best-practices` (router), `-create`, `-markup`, `-render`, `-studio`, `-captions`, `-maps`, `-saas`, `-interactivity`, `-docs`, `-upgrade` and `-multimedia`.
  - [github.com/remotion-dev/claude-code-plugin](https://github.com/remotion-dev/claude-code-plugin), which packages them.
  - Also listed in the claude.ai Anthropic Directory (community tier, v4.0.528).
- **What it does:** teaches agents to build compositions and to render videos or stills. Key rule from `remotion-markup/SKILL.md`: animations must be driven by `useCurrentFrame()` and `interpolate()`. It says:

  > CSS `transition` or `animation` will not render correctly … Tailwind animation class will not render correctly

  By the same logic, our time-based framer-motion animations would need the same refactor (inference).
- **Install:**
  - Plugin, from the shell: `claude plugin marketplace add remotion-dev/claude-code-plugin`, then `claude plugin install remotion@remotion`, then restart.
  - Skills only: `npx skills add remotion-dev/skills`.
  - **Pinning caveat:** the marketplace entry's plugin source is `{"source":"github","repo":"remotion-dev/claude-code-plugin"}` with no ref or SHA. Pinning the marketplace with `#ref` does not pin the plugin. To pin, vendor the files, or declare a `settings`-type marketplace with a `sha` (7.5).
- **Maintenance:**
  - skills repo: about 5.3k stars; HEAD `1441a11e95db35443bd76bb318386c0d3ca00053` (2026-10-16); skill version 4.0.536.
  - plugin repo: HEAD `c8dd116b7dfdb033805698ed71e60232b9f8cbfc` (2026-10-16).
  - `remotion`, `@remotion/player` and `@remotion/web-renderer` are all at 4.0.536 on npm (2026-10-16).
- **License:**
  - **Skills:** no LICENSE file in either repo. The plugin's `marketplace.json` declares `"license": "MIT"`.
  - **Remotion runtime:** the "Remotion License" is source-available, not OSS. It is free for individuals, for-profit organisations with up to 3 employees, non-profits and evaluation; otherwise a Company License is required.
  - The 5.0 migration guide (`packages/docs/docs/5-0-migration.mdx` in the Remotion repo) says contractors will count toward team size. It also says rendering APIs and the Remotion config file must be given a license key, with `"free-license"` for free-tier users, and that Company License holders must enable telemetry. 5.0 is not yet released; npm `latest` is 4.0.536.
- **Trust:**
  - Low to medium for the skills: markdown, plus a few `.mjs` geo-prep scripts in `remotion-maps`, which we do not need.
  - Medium for the runtime because of the license.
- **Runtime options if we adopt it:**
  - `@remotion/player` embeds a composition in the page.
  - `@remotion/web-renderer` (`renderMediaOnWeb()` and `renderStillOnWeb()`) encodes MP4 in the browser with WebCodecs via Mediabunny. The docs (`client-side-rendering/index.mdx`) say it is **stable from 4.0.491**, but it is limited to a subset of HTML elements and CSS (see `client-side-rendering/limitations.mdx`; for example, filters do not work in Safari). It needs Chrome 94+, Firefox 130+ or Safari 26+, and provides `canRenderMediaOnWeb()` as a pre-flight check.
  - Server rendering needs headless Chrome and FFmpeg in our Docker image, run as a BullMQ job.
- **Use here:**
  - Only for a stretch "Download your Rewind as a video" feature.
  - Build a separate `components/rewind-video/` composition tree that shares tokens and data (`types/wrapped`, `lib/wrapped/statistics-types.ts`) with the slides, but not their animation code.
  - Prefer client-side `renderMediaOnWeb()` behind a feature flag with a PNG fallback.
  - Document the license implication for operators in `docs/`. Most self-hosters are individuals, which the free license covers.
  - Install the skills **only** in a dev branch or at user scope while building this feature.

#### 4.4.2 HyperFrames (HeyGen)

- **Source:** [github.com/heygen-com/hyperframes](https://github.com/heygen-com/hyperframes) ("Write HTML. Render video. Built for agents.")
- **What it does:** renders HTML, CSS and seekable animations to deterministic MP4 by seeking each frame in headless Chrome (`puppeteer-core`) and encoding with FFmpeg. Runtime adapters cover GSAP, Lottie, Three.js, Anime.js, CSS, WAAPI and custom frame adapters. It publishes 21 skills.
- **Install:**
  - Plugin, two ways:
    - `claude plugin marketplace add heygen-com/hyperframes`, then `claude plugin install hyperframes@hyperframes`;
    - or `/plugin install hyperframes@claude-plugins-official`, which is pinned to `8d2b6e7bdc1c2c26d1abf64ef075c00a1bb230a2`.
  - Skills only: `npx skills add heygen-com/hyperframes`.
- **Maintenance:** about 65.7k stars; created 2026-03-10; npm `hyperframes` 0.8.168 (2026-10-17). It is pre-1.0 and changes fast.
- **License:** Apache-2.0. GSAP is optional (the `hyperframes` npm package does not depend on it); if used, it has its own no-charge license and is not OSI open source (unverified for current terms).
- **Trust:** medium. The plugin is large, and server rendering needs Node 22+ (`engines: >=22`), Chrome and FFmpeg.
- **Use here:** an alternative to Remotion **only** if we want server-rendered MP4s without Remotion's license terms. It costs a heavier Docker image, plus GSAP's license terms if we choose the GSAP adapter over CSS or WAAPI. Not recommended for the December deadline.

#### 4.4.3 Other video plugins seen

These are not recommended.

| Plugin | Notes |
|---|---|
| `video-shotcraft` (community, Remotion shot recipes) | Third-party layer over Remotion; use the official skills instead |
| `motion-reel`, `animation-studio` (community, frame-drawn films with synthesized audio) | Wrong fit: they produce standalone films, not app features |
| `runway-api` (official catalogue, pinned) | Generative video through Runway's API. Paid, and per-user generation raises privacy concerns |
| `remotion-skills-marketplace` (community, pasie15) | Third-party repackaging of official skills. Avoid |

### 4.5 Image generation

#### 4.5.1 Model landscape (October 2026)

| Vendor | Current models | Notes | Confidence |
|---|---|---|---|
| OpenAI | `gpt-image-2` (snapshot `gpt-image-2-2026-04-21`); `gpt-image-2.5-sunburst` (quality) and `gpt-image-2.5-flare` (speed), snapshots dated 2026-09-08 | `gpt-image-1` shuts down **2026-10-23** (substitutes: 2.5 Sunburst or Flare). `gpt-image-1.5`, `gpt-image-1-mini` and `chatgpt-image-latest` shut down 2026-12-01. `gpt-image-2` and both 2.5 models accept arbitrary `WIDTHxHEIGHT` sizes: both sides divisible by 16, aspect ratio between 1:3 and 3:1, maximum 3840x2160, and anything above 2560x1440 is "experimental". Per-image 1024x1024 list cost for `gpt-image-2`: about $0.006 low, $0.053 medium, $0.211 high (unverified; third-party pages agree, and measured token-billed costs can be higher) | Model IDs, snapshot dates and size rules come from the official `openai-python` SDK (`src/openai/types/image_generate_params.py`, 2026-10-17). Shutdown dates and prices come from search snippets of developers.openai.com and third-party pages, which are not fetchable here (unverified) |
| Google | Nano Banana 2.1 (`gemini-nano-banana-2.1`), GA 2026-10-06, 1K/2K/4K, recommended for new projects; Nano Banana 2 Lite (`gemini-3.1-flash-lite-image`), GA 2026-06-30 | Imagen 4 (`imagen-4.0-*`) shut down 2026-08-17. `gemini-3.1-flash-image` (Nano Banana 2) deprecated; secondary sources disagree on whether a 2026-10-29 shutdown date still stands (unverified). Preview image models retired 2026-06-25 (unverified). Nano Banana 2 Lite outputs 1K only. Output carries a SynthID watermark (unverified for 2.1) | Search snippets of ai.google.dev changelog and deprecations, and of docs.cloud.google.com |
| Black Forest Labs | FLUX.2 `[klein]` (4B Apache-2.0; 9B under the FLUX non-commercial license), open-weight `[dev]` (32B, non-commercial), and API-only `[pro]`, `[flex]`, `[max]` (up to 8 reference images via API; `[max]` has search grounding); FLUX 3 mentioned for video | Pricing is per megapixel and sources conflict (unverified): BFL's help centre gives `[max]` from $0.07/MP and `[flex]` from $0.06/MP; `[pro]` at about $0.03/MP and fal's `[flex]` at $0.05/MP come from snippets only | `[klein]` and `[dev]` licensing verified in the `black-forest-labs/flux2` README; the rest from search snippets of docs.bfl.ai, help.bfl.ai and bfl.ai |

#### 4.5.2 MCP servers and skills for image generation

| Candidate | Source | Install (Claude Code) | Status / license | Trust |
|---|---|---|---|---|
| **fal MCP** (first-party; about 1,000 models incl. FLUX.2, Nano Banana, GPT Image (model count unverified)) | fal.ai/docs/documentation/setting-up/mcp | `claude mcp add --transport http --scope user fal https://mcp.fal.ai/mcp-relay`, then `/mcp` to sign in with OAuth. Older docs use `https://mcp.fal.ai/mcp` with `--header "Authorization: Bearer $FAL_KEY"` | Hosted; no charge for the MCP, model runs billed. Search snippets of fal docs | Medium: hosted third-party, billed per run |
| **BFL FLUX MCP** (first-party) | docs.bfl.ai/api_integration/mcp_integration | `claude mcp add --transport http FLUX https://mcp.bfl.ai` (OAuth; billed to the chosen org) | Hosted (search snippet of help.bfl.ai) | Medium |
| **Replicate MCP** (first-party) | replicate.com/docs/reference/mcp, mcp.replicate.com | `claude mcp add replicate https://mcp.replicate.com/sse --transport sse --scope user`, then `/mcp` | Hosted. The Claude Code MCP docs mark the SSE transport as deprecated (still supported, and Claude Code tries HTTP first); Replicate's docs may now list the bare host instead of `/sse` (unverified). The old community `deepfates/mcp-replicate` is archived on GitHub | Medium |
| **shinpr/mcp-image** (community; Gemini, OpenAI GPT Image, Seedream; automatic prompt optimisation) | [github.com/shinpr/mcp-image](https://github.com/shinpr/mcp-image) | `claude mcp add mcp-image --env GEMINI_API_KEY=… --env IMAGE_OUTPUT_DIR=/abs/path -- npx -y mcp-image`; bundled prompt skill via `npx mcp-image skills install --path <dir>` | MIT, about 178 stars, npm 0.18.0 (2026-10-08), active | High-ish: single-author local process holding your API keys. Pin the version (`mcp-image@0.18.0`) and review it if used |
| **OpenAI `imagegen` skill** (first-party, Codex) | [github.com/openai/skills](https://github.com/openai/skills) at `skills/.system/imagegen` | Codex only; relies on Codex's built-in `image_gen` tool. Its CLI fallback `scripts/image_gen.py` needs the `openai` Python package and `OPENAI_API_KEY` | About 28.1k stars; no license field in the frontmatter, but the skill folder ships an Apache-2.0 `LICENSE.txt` | Not usable as-is in Claude Code |
| **`image-generation` prompting skill** (community, Ahmed Raza; in the claude.ai directory and the `claude-community` catalogue, pinned `721c3faf…`) | github.com/ahmedraza28/image-generation-skill | `/plugin marketplace add anthropics/claude-plugins-community`, then `/plugin install image-generation@claude-community` | Instruction-only prompting guide for Imagen, Gemini, GPT Image, FLUX and others | Low to medium: instructions only, third-party |
| Gemini CLI `nanobanana` extension | [github.com/gemini-cli-extensions/nanobanana](https://github.com/gemini-cli-extensions/nanobanana) | Gemini CLI only | About 1.1k stars | Not for Claude Code |

**How we would use image generation here (dev-time only):**

1. Generate a **fixed, reviewed asset set** and commit it under `public/rewind/2026/`:
   - one illustration or poster-style artwork per archetype (the 12 IDs in `lib/wrapped/llm-output-schema.ts`);
   - 3 to 5 abstract slide backgrounds;
   - empty-state art.
2. Keep **content imagery from Plex/TMDB posters**. These are already used by `components/wrapped/cinematic/poster-image.tsx`. Never generate fake posters of real titles.
3. **Do not generate per-user images at runtime.** The reasons:
   - cost and latency at December peak;
   - it would send viewing history and usernames to a third party;
   - nondeterministic output breaks screenshot tests;
   - SynthID or other watermark and licensing questions.

   If the owner later wants it, make it an explicit admin opt-in. It would need a provider abstraction under `lib/connections/` and Zod-validated responses, per CLAUDE.md.
4. Record the prompt, model ID, seed (if any) and date for each committed asset in a `public/rewind/2026/ASSETS.md`. Assets can then be regenerated after a model shutdown such as `gpt-image-1` on 2026-10-23.

### 4.6 Visual QA and screenshot testing

| Candidate | Source | What it does | Install | Status / license | Use here |
|---|---|---|---|---|---|
| **Playwright `toHaveScreenshot()`** (built-in) | playwright.dev | Pixel-diff assertions with masks, thresholds and per-OS baselines | Already installed (`@playwright/test` 1.57) | Apache-2.0; about 97.9k stars | **Primary visual regression tool.** See 7.4 |
| **Playwright CLI + skills** | [github.com/microsoft/playwright-cli](https://github.com/microsoft/playwright-cli) | Token-efficient browser CLI for agents: `open`, `snapshot`, `screenshot [ref]`. The Playwright MCP README recommends it over MCP for coding agents | `npm install -g @playwright/cli@latest` (0.1.22), then `playwright-cli install --skills` | Apache-2.0; about 14.3k stars; HEAD `b85c7a73…` | Agent "eyes" while redesigning: grab screenshots of a page or slide, compare against the design plan |
| **Playwright MCP** | [github.com/microsoft/playwright-mcp](https://github.com/microsoft/playwright-mcp); official plugin `playwright@claude-plugins-official` | Accessibility-tree browser control; `browser_take_screenshot`; `--caps=vision` for coordinate tools | `claude mcp add playwright npx @playwright/mcp@latest`; pin to `@playwright/mcp@0.0.83` | Apache-2.0; about 38.3k stars. The official plugin's `.mcp.json` uses unpinned `@latest` | Alternative to the CLI; heavier on context |
| **Chrome DevTools MCP** | [github.com/ChromeDevTools/chrome-devtools-mcp](https://github.com/ChromeDevTools/chrome-devtools-mcp) | Performance traces and insights, network, console with source maps, screenshots, Puppeteer automation; `--slim --headless` mode; CrUX lookups (disable with `--no-performance-crux`) | `/plugin install chrome-devtools-mcp@claude-plugins-official` (pinned `a878bcad…`), or `.mcp.json` args `["-y","chrome-devtools-mcp@1.11.0","--headless","--no-performance-crux"]` | Apache-2.0; about 53.7k stars; npm 1.11.0 (2026-10-15) | Profile Rewind slide transitions for jank, measure LCP of the share page |
| `agent-browser` (Vercel) | [github.com/vercel-labs/agent-browser](https://github.com/vercel-labs/agent-browser) | Rust browser-automation CLI for agents; required by `next-dev-loop` | `npm i -g agent-browser@0.39.1` | Apache-2.0; about 44.1k stars | Only with `next-dev-loop` after the Next 16.3+ upgrade |
| Anthropic `webapp-testing` | anthropics/skills | Python Playwright and `with_server.py` | Vendor | Apache-2.0 | Not needed |
| Argos (SaaS) | [github.com/argos-ci/argos](https://github.com/argos-ci/argos), mcp.argos-ci.com | Hosted visual review; official MCP (`claude mcp add --transport http argos https://mcp.argos-ci.com`) and agent skills, per a July 2026 changelog (search snippet) | SaaS account | About 641 stars | Optional, only if baselines need a review UI; self-hosted `toHaveScreenshot` is enough |
| Meticulous, agentiqa (community catalogue) | community | Hosted visual regression or QA | — | — | Not needed |
| lost-pixel | github.com/lost-pixel/lost-pixel | OSS Percy alternative | — | **Archived** | Do not adopt |
| Axe MCP (Deque, `axe-accessibility` plugin) | dequelabs | Accessibility scan and remediation over MCP | — | **Requires a paid Axe DevTools for Web subscription**; proprietary | Not needed. We already run `@axe-core/playwright` |

Community visual-regression skills (`testland/playwright-snapshots`, `qaskills`, etc.) mostly encode `toHaveScreenshot` conventions. A short project skill (7.3) is safer than adopting one of them.

### 4.7 Directories and curated lists (discovery only)

| List | Stars | Note |
|---|---|---|
| [ComposioHQ/awesome-claude-skills](https://github.com/ComposioHQ/awesome-claude-skills) | About 77.3k | Broad; no security review |
| [hesreallyhim/awesome-claude-code](https://github.com/hesreallyhim/awesome-claude-code) | About 55.9k | Skills, plugins and tooling |
| [VoltAgent/awesome-agent-skills](https://github.com/VoltAgent/awesome-agent-skills) | About 35.9k | "1000+ skills from official dev teams and the community" |
| [travisvn/awesome-claude-skills](https://github.com/travisvn/awesome-claude-skills) | About 15.4k | Claude Code focused |
| skills.sh (Vercel) | — | Ranked by install counts; shows automated partner scan results (Gen, Socket, Snyk), which the `skills` CLI also prints at install. These are not a manual review |
| claude.com/marketplace | — | Official web catalogue with install counts and an "Anthropic verified" badge |
| `zhuyansen/awesome-ai-image-skills` | 1 | Claims security grading of about 152 image skills and MCPs. Too new to trust |

Aggregator sites (skillselion, claudeskills.info, mdskills, tessl) gave conflicting install counts and sometimes wrong install commands. Use them only to find a primary repo.

## 5. Comparison matrix

| Candidate | Helps UI refresh | Helps Rewind | Dev-time / runtime | License | Pin method | Risk |
|---|---|---|---|---|---|---|
| `frontend-design` | High | High | Dev | Apache-2.0 | Vendor at SHA | Low |
| Vercel `web-design-guidelines` (patched) | High | Medium | Dev | MIT | Vendor at SHA plus local rules copy | Low after patch |
| Vercel `react-best-practices` | Medium | Medium | Dev | MIT | Vendor at SHA | Low |
| Vercel `composition-patterns` | Medium | Low | Dev | MIT | Vendor at SHA | Low |
| Vercel `react-view-transitions` | Medium | Medium | Dev (feature uses React canary in Next) | MIT | Vendor at SHA | Low |
| Motion `motion` skill | Medium | High | Dev (library already runtime) | MIT (npm `motion-ai`) | Vendor from `motion-ai@14.2.0` tarball (identical to ai-kit SHA) | Low |
| Playwright `toHaveScreenshot` + project skill | High | High | Dev/CI | Apache-2.0 | npm lockfile | Low |
| `playwright-cli` skills | Medium | Medium | Dev | Apache-2.0 | `@playwright/cli@0.1.22` | Low to medium |
| Chrome DevTools MCP | Medium | Medium | Dev | Apache-2.0 | Official plugin SHA or npm version | Medium |
| Remotion skills (+ runtime) | — | Medium (video only) | Dev skills; optional runtime | Skills: MIT declared, no file; runtime: Remotion License | Vendor at SHA; npm 4.0.536 | Medium |
| Image-gen MCP (fal / BFL / Replicate) | Low | Medium (assets) | Dev only | Vendor ToS | User-scope config | Medium |
| shadcn skill + MCP | High *if adopted* | Low | Dev | MIT | Vendor at SHA; pin `shadcn@4.22.0` | Medium |
| Figma MCP | High *if Figma used* | Medium | Dev | Figma ToS | Official plugin SHA | Medium |
| `next-dev-loop` | Medium | Medium | Dev | MIT | `vercel/next.js` SHA | Medium; needs Next 16.3+ |
| Anthropic design plugin (2 skills) | Medium | Low | Dev | Apache-2.0 | Vendor skills only | Low |
| HyperFrames | — | Low (video alternative) | Runtime if adopted | Apache-2.0 (+ GSAP terms) | Official plugin SHA | Medium to high |

## 6. Ranked shortlist

1. **Anthropic `frontend-design`** (vendor). It sets design direction for both the refresh and Rewind 2026. It has the highest leverage, no code, and a permissive license.
2. **Playwright visual regression** (`toHaveScreenshot` + a project `visual-qa` skill), with **`playwright-cli` skills** for ad-hoc screenshots. Without baselines, a "consistent" refresh cannot be checked or kept.
3. **Vercel `web-design-guidelines` (patched to local rules) + `react-best-practices` + `composition-patterns`** (vendor). These give a systematic audit of existing UI and component APIs, and they produce findings in a format that maps cleanly onto issues.
4. **Motion `motion` skill** (vendor; free MCP optional at user scope). It covers Rewind slide animation quality and performance, and the `framer-motion` 12 to `motion` 14 upgrade.
5. **Vercel `react-view-transitions`** (vendor). It gives native route and page transitions for a "modern" feel at low JS cost, and complements Motion.
6. **Chrome DevTools MCP** (official plugin, pinned SHA, user or local scope). Use it to profile animated slides and the share page on real traces.
7. **One first-party image-generation MCP at user scope** (fal OAuth relay, or BFL FLUX MCP). Use it to produce the committed archetype and background asset set; Nano Banana 2.1 or `gpt-image-2.5` via fal or direct API are also fine.
8. **Remotion skills** (dev-time, only if the "Rewind video" stretch goal is approved). They are the best-documented agent path to MP4. Keep them out of the default skill set until then.

Conditional, decided in the design phase: **shadcn skill + MCP** if we adopt shadcn; **Figma MCP** if the owner designs in Figma; **`next-dev-loop`** once on Next 16.3+.

## 7. Recommendations for this repo

### 7.1 Vendoring procedure (pin, review, record)

1. **Check out the skill at a SHA.** For each skill, use a partial, sparse clone in a scratch directory, never inside the repo:

   ```bash
   SRC=https://github.com/anthropics/skills.git
   SHA=dbd4588f9e1033efb41dad4bef2f7947c8993d44
   DIR="$(mktemp -d)/vendor"
   git clone --filter=blob:none --no-checkout "$SRC" "$DIR"
   git -C "$DIR" sparse-checkout set skills/frontend-design
   git -C "$DIR" checkout "$SHA"
   ```
2. **Review every file** before copying. For each file:
   - Read the full `SKILL.md` and every referenced `.md`.
   - Look for `allowed-tools`, `` !` `` injection lines, `hooks`, `scripts/`, binaries, `*.zip` and `*.tar.gz`, and URLs fetched at runtime.
   - Delete anything not needed. Examples: `agents/openai.yml` and `assets/*.png` in the shadcn skill, `*.zip` in the Vercel repo, `remotion-maps` geo scripts.
3. **Copy into `.claude/skills/<name>/`** and keep upstream's `LICENSE.txt` next to it. Apache-2.0 requires keeping the notice and stating changes.
4. **Record provenance** in one file, `.claude/skills/THIRD_PARTY.md`, with one row per skill:
   - name;
   - upstream repo and path;
   - commit SHA;
   - license;
   - date reviewed;
   - reviewer;
   - local modifications. For example: `web-design-guidelines` reads `./guidelines/command.md` instead of fetching from `main`; shadcn pinned to `shadcn@4.22.0`.
5. **Update deliberately.** To update, repeat with a new SHA and review `git diff <old> <new> -- <path>` upstream before copying. Do not run `npx skills update` against vendored copies.
6. **Only vendor licensed content.** Vendor skills whose license is explicit: Apache-2.0 for Anthropic, MIT for Vercel, shadcn and Motion. For Motion, take the files from the MIT-licensed `motion-ai@14.2.0` npm tarball (`content/skills/motion/`), not the unlicensed ai-kit git repo; the contents are identical. Remotion's skill repos have no LICENSE file (only the plugin's `marketplace.json` declares MIT), so install those via the plugin at user scope instead of committing them, or ask Remotion to add a license file.

### 7.2 Proposed `.claude/skills/` layout

Commit this layout (all dev-time):

```
.claude/skills/
  THIRD_PARTY.md                     provenance table (7.1)
  frontend-design/                   anthropics/skills @ dbd4588f (Apache-2.0)
  web-design-guidelines/             vercel-labs/agent-skills @ 063bee94 (MIT), patched
    guidelines/command.md            vercel-labs/web-interface-guidelines @ 434b7f91
  vercel-react-best-practices/       vercel-labs/agent-skills @ 063bee94 (MIT)
  vercel-composition-patterns/       vercel-labs/agent-skills @ 063bee94 (MIT)
  vercel-react-view-transitions/     vercel-labs/agent-skills @ 063bee94 (MIT)
  motion/                            npm motion-ai@14.2.0 content/skills/motion (MIT; = ai-kit @ b7e2c68f)
  accessibility-review/              anthropics/knowledge-work-plugins (Apache-2.0), skill only
  rewind-design-system/              project-authored (7.3)
  rewind-slide/                      project-authored (7.3)
  share-card/                        project-authored (7.3)
  visual-qa/                         project-authored (7.3)
```

Use the frontmatter `paths:` field so skills auto-load only where relevant:

| Skill | `paths:` |
|---|---|
| `motion`, `rewind-slide` | `components/wrapped/**`, `components/rewind/**` |
| `share-card` | `app/api/wrapped/og-image/**` |
| `vercel-react-view-transitions` | `app/**` |

### 7.3 Project-authored skills to write

These encode our conventions. Third-party skills cannot know them.

- **`rewind-design-system`** captures the Rewind 2026 tokens once the design phase settles them: colour, type scale, motion presets, slide pacing. Sources:
  - `app/globals.css` `@theme`;
  - `components/wrapped/cinematic/theme.ts`.

  It should also say when to use poster imagery vs generated art. Optionally mirror it as a root `DESIGN.md`, a format the shadcn skill and Google Stitch understand.
- **`rewind-slide`** is a checklist for adding a slide. It covers:
  - the data contract from `types/wrapped` and `lib/wrapped/statistics-types.ts`;
  - section registration in `components/wrapped/wrapped-sections/index.tsx`;
  - Motion patterns with reduced-motion handling;
  - `data-testid` naming per CLAUDE.md;
  - mock data in `lib/wrapped/mock-data.ts`;
  - a Jest test in `__tests__/`;
  - a screenshot baseline (7.4).
- **`share-card`** covers `next/og` / Satori constraints for `app/api/wrapped/og-image/route.tsx`:
  - flexbox-only layout;
  - limited CSS;
  - fonts must be loaded explicitly;
  - the 1200x630 and 1080x1920 sizes;
  - the rate limiter;
  - keeping text short so it does not overflow.
- **`visual-qa`** tells agents how to run and update visual baselines: `npx playwright test --project=visual`, with `--update-snapshots` only when the change is intended. It should also say how to read diff artifacts and when to use `playwright-cli screenshot` for quick looks.

### 7.4 Add a Playwright visual project

- **Config:** in `playwright.config.ts`, add a `visual` project with `testMatch: /visual\/.*\.spec\.ts/`, and set `expect.toHaveScreenshot`:
  - `animations: 'disabled'`;
  - `caret: 'hide'`;
  - a small `maxDiffPixelRatio`, e.g. 0.01;
  - a `snapshotPathTemplate` under `e2e/visual/__screenshots__/{projectName}/{arg}{ext}`.

  `playwright.config.ts` is not in the `Edit` allow list in `.claude/settings.json`; only `./e2e/**` is. Expect a permission prompt for this change.
- **Specs:** create `e2e/visual/*.spec.ts` covering:
  - key app shells: home, onboarding steps, admin dashboard, users table, settings;
  - **each Rewind slide** rendered from `lib/wrapped/mock-data.ts`, at 390x844 and 1440x900.

  Use `mask` for dynamic regions such as avatars and timestamps.
- **Determinism:** generate baselines in the same Linux container as CI (the project `Dockerfile` or the Playwright image), so fonts and anti-aliasing match.
- **Accessibility:** keep axe scans in `e2e/accessibility.spec.ts`. Add new Rewind pages to them.

### 7.5 MCP and plugin configuration

**Commit a minimal `.mcp.json`** containing only servers that need no secrets, with pinned versions:

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": ["-y", "chrome-devtools-mcp@1.11.0", "--headless", "--no-performance-crux"]
    }
  }
}
```

**Add Playwright MCP only if** `playwright-cli` is not preferred: `"args": ["@playwright/mcp@0.0.83"]`. Do not add both.

**Keep these at user scope, never committed:** image-generation MCPs, Figma, Motion+ and Argos.

```bash
claude mcp add --transport http --scope user fal https://mcp.fal.ai/mcp-relay
```

**Optional local plugin pinning** (not loaded in cloud sessions, per 3.4):

- Declare an inline marketplace in `.claude/settings.local.json`, so plugins come from pinned SHAs rather than default branches. The schema follows the `settings` marketplace-source docs; I have not tested it here.

  ```json
  {
    "extraKnownMarketplaces": {
      "plex-manager-pinned": {
        "source": {
          "source": "settings",
          "name": "plex-manager-pinned",
          "owner": { "name": "plex-manager" },
          "plugins": [
            {
              "name": "remotion",
              "source": {
                "source": "github",
                "repo": "remotion-dev/claude-code-plugin",
                "sha": "c8dd116b7dfdb033805698ed71e60232b9f8cbfc"
              }
            }
          ]
        }
      }
    }
  }
  ```
- Leave auto-update **off** for any third-party marketplace you add (`/plugin` > Marketplaces).

### 7.6 Settings hardening (`.claude/settings.json`)

- **Shell injection.** If no vendored skill needs `` !` `` injection (true for the list in 7.2, which leaves out shadcn), add `"disableSkillShellExecution": true`. If shadcn is adopted later, keep its injection but pin the version, or replace it with a documented manual step.
- **Permissions.** Add `Skill(...)` allow rules for the vendored skills, and consider denying `Skill` for anything not in `.claude/skills/THIRD_PARTY.md`. Per the docs, `skillOverrides` can hide synced skills we do not want.
- **Review rule.** Any PR that touches `.claude/skills/**` or `.mcp.json` should get a security review. Use the existing `/security-review` skill or `/review`.

### 7.7 Dev-time vs runtime summary

| Category | Items |
|---|---|
| **Dev-time only** | All skills; all MCP servers (Chrome DevTools, Playwright, image generation, Figma, shadcn, Motion); `playwright-cli`; `agent-browser`; Remotion and HyperFrames skills |
| **Runtime, already present** | `framer-motion` (upgrade path to `motion` 14 to be decided), `next/og`, chart.js (keep or replace, to be decided) |
| **Runtime, candidates** | `@remotion/player` and `@remotion/web-renderer` 4.0.536 (only for the video stretch goal, behind a feature flag); `visx` or Recharts (if the design phase replaces chart.js) |
| **Runtime, not recommended** | Per-user AI image generation; HyperFrames or Remotion server rendering in the main Docker image |

### 7.8 How the shortlist plugs into the Rewind 2026 workflow

1. **Design phase.**
   - `frontend-design` produces the Rewind 2026 token plan and slide wireframes.
   - The `dataviz` session skill guides stat-slide chart forms and palettes.
   - `accessibility-review` checks contrast and motion.
   - Output: `rewind-design-system` skill and `DESIGN.md`.
2. **Asset phase.** One first-party image MCP (user scope) generates the 12 archetype artworks and the backgrounds. The owner reviews and commits them to `public/rewind/2026/` with `ASSETS.md` provenance.
3. **Build phase.**
   - `rewind-slide` + `motion` + `vercel-react-best-practices` for each slide.
   - `vercel-react-view-transitions` for intro, deck and outro route changes.
   - `share-card` for the new OG and story cards.
4. **Verify phase.**
   - `visual-qa` baselines for every slide at two viewports.
   - Chrome DevTools MCP traces for jank on mid-range mobile emulation.
   - `web-design-guidelines` pass over the new `components/wrapped/**` or `components/rewind/**`.
5. **Stretch.** If approved, Remotion skills plus `@remotion/web-renderer` for a client-side "export as video", with a PNG fallback and an operator note on the Remotion License.

### 7.9 Open questions for the design phase

- **Stay on own primitives or adopt shadcn (Base UI or Radix)?** This decides whether the shadcn skill and MCP are in scope.
- **Keep or retire the Cinematic Premiere look?** It hits four of `frontend-design`'s generic tells: near-black with one accent, tinted near-black, ALL-CAPS tracked eyebrows, single-word gold highlight.
- **Is MP4 export a must for December, or a 2027 follow-up?** This decides Remotion vs no video.
- **Does the owner use Figma?** This decides the Figma MCP.
- **Upgrade Next to 16.4.x during the refresh?** That unlocks `next-dev-loop`, the bundled agent docs and `transitionTypes` on `next/link` (16.2+). It also means `next dev` will start managing an `AGENTS.md` block unless `agentRules` turns it off.

## 8. Sources

Dates are publication or last-update dates where known; otherwise the date I retrieved the page (2026-10-17). "(snippet)" means the content came from a search-result snippet of that official page, because the page could not be fetched from this sandbox.

**Claude Code documentation**
- Skills (locations, frontmatter, `allowed-tools`, `!` injection, `disableSkillShellExecution`): https://code.claude.com/docs/en/skills (retrieved 2026-10-17)
- Install and manage plugins (marketplace add `#ref`, scopes, auto-update): https://code.claude.com/docs/en/plugins/install (retrieved 2026-10-17)
- Create a marketplace: https://code.claude.com/docs/en/plugin-marketplaces (retrieved 2026-10-17)
- Marketplace reference (plugin sources, `ref`/`sha` pinning, reserved names, `settings` source): https://code.claude.com/docs/en/plugins/marketplace-reference (retrieved 2026-10-17)
- Plugin security and trust: https://code.claude.com/docs/en/plugins/security (retrieved 2026-10-17)
- Anthropic's marketplaces (official, community, demo): https://code.claude.com/docs/en/plugins/anthropic-marketplaces (retrieved 2026-10-17)
- Cloud environments, "What carries over from your setup": https://code.claude.com/docs/en/cloud-environments (retrieved 2026-10-17)

**Anthropic repositories**
- anthropics/skills (HEAD `dbd4588f`, 2026-10-09): https://github.com/anthropics/skills
- frontend-design SKILL.md: https://raw.githubusercontent.com/anthropics/skills/main/skills/frontend-design/SKILL.md
- web-artifacts-builder, webapp-testing, theme-factory, canvas-design, algorithmic-art, slack-gif-creator, brand-guidelines: https://github.com/anthropics/skills/tree/main/skills
- anthropics/claude-plugins-official (catalogue retrieved 2026-10-17): https://github.com/anthropics/claude-plugins-official
- anthropics/claude-plugins-community (catalogue retrieved 2026-10-17): https://github.com/anthropics/claude-plugins-community
- anthropics/knowledge-work-plugins, design plugin: https://github.com/anthropics/knowledge-work-plugins/tree/main/design

**Vercel / Next.js**
- vercel-labs/agent-skills (HEAD `063bee94`, 2026-08-28): https://github.com/vercel-labs/agent-skills
- web-design-guidelines SKILL.md: https://raw.githubusercontent.com/vercel-labs/agent-skills/main/skills/web-design-guidelines/SKILL.md
- react-view-transitions SKILL.md: https://raw.githubusercontent.com/vercel-labs/agent-skills/main/skills/react-view-transitions/SKILL.md
- vercel-labs/web-interface-guidelines (HEAD `434b7f91`): https://github.com/vercel-labs/web-interface-guidelines
- vercel-labs/skills (`npx skills` CLI 1.7.2): https://github.com/vercel-labs/skills
- vercel/next.js skills directory: https://github.com/vercel/next.js/tree/canary/skills
- next-dev-loop SKILL.md: https://raw.githubusercontent.com/vercel/next.js/canary/skills/next-dev-loop/SKILL.md
- Next.js 16.3 AI improvements (snippet): https://nextjs.org/blog/next-16-3-ai-improvements
- Next.js MCP guide (snippet): https://nextjs.org/docs/app/guides/mcp.md
- vercel-labs/agent-browser: https://github.com/vercel-labs/agent-browser

**shadcn/ui**
- shadcn skill: https://github.com/shadcn-ui/ui/tree/main/skills/shadcn
- shadcn MCP docs source: https://raw.githubusercontent.com/shadcn-ui/ui/main/apps/v4/content/docs/(root)/mcp.mdx
- shadcn skills docs (snippet): https://ui.shadcn.com/docs/skills.md

**Motion**
- motiondivision/ai-kit (HEAD `b7e2c68f`, 2026-10-15): https://github.com/motiondivision/ai-kit
- Motion AI Kit install (snippet): https://motion.dev/docs/ai-kit-install
- Motion AI Kit overview (snippet): https://motion.dev/ai-kit

**Remotion**
- remotion-dev/skills (HEAD `1441a11e`, 2026-10-16): https://github.com/remotion-dev/skills
- remotion-dev/claude-code-plugin (HEAD `c8dd116b`, 2026-10-16): https://github.com/remotion-dev/claude-code-plugin
- Claude Code plugin doc source: https://raw.githubusercontent.com/remotion-dev/remotion/main/packages/docs/docs/ai/claude-code-plugin.mdx
- Remotion License: https://raw.githubusercontent.com/remotion-dev/remotion/main/LICENSE.md
- Client-side rendering and web renderer (snippet): https://www.remotion.dev/docs/client-side-rendering/ and https://www.remotion.dev/docs/web-renderer/
- 5.0 migration notes (snippet): https://www.remotion.dev/docs/5-0-migration

**HyperFrames**
- heygen-com/hyperframes: https://github.com/heygen-com/hyperframes

**Figma**
- figma/mcp-server-guide: https://github.com/figma/mcp-server-guide

**Image generation**
- OpenAI deprecations (snippet): https://developers.openai.com/api/docs/deprecations
- OpenAI image generation guide (snippet): https://developers.openai.com/api/docs/guides/image-generation
- OpenAI pricing (snippet): https://developers.openai.com/api/docs/pricing
- GPT-Image-2.5 Sunburst model page (snippet): https://developers.openai.com/api/docs/models/gpt-image-2.5-sunburst
- GPT-Image-2.5 Flare model page (snippet): https://developers.openai.com/api/docs/models/gpt-image-2.5-flare
- Introducing gpt-image-2 (community announcement, snippet): https://community.openai.com/t/introducing-gpt-image-2-available-today-in-the-api-and-codex/1379479
- Introducing GPT Images 2.5 (community announcement, snippet): https://community.openai.com/t/introducing-gpt-images-2-5-in-the-api-and-chatgpt/1395897
- openai/skills (imagegen): https://github.com/openai/skills
- Gemini API changelog (snippet): https://ai.google.dev/gemini-api/docs/changelog
- Gemini API deprecations (snippet): https://ai.google.dev/gemini-api/docs/deprecations
- Gemini image generation (snippet): https://ai.google.dev/gemini-api/docs/image-generation
- Google Cloud, Nano Banana 2.1 (snippet): https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/gemini/nano-banana-2-1
- BFL FLUX.2 overview (snippet): https://docs.bfl.ai/flux_2/flux2_overview
- BFL FLUX MCP (snippet): https://docs.bfl.ai/api_integration/mcp_integration and https://help.bfl.ai/articles/2286461195-what-is-the-flux-mcp
- fal MCP docs (snippet): https://fal.ai/docs/documentation/setting-up/mcp and https://fal.ai/docs/documentation/setting-up/mcp/claude-code
- Replicate MCP (snippet): https://replicate.com/docs/reference/mcp and https://mcp.replicate.com/
- shinpr/mcp-image: https://github.com/shinpr/mcp-image
- gemini-cli-extensions/nanobanana: https://github.com/gemini-cli-extensions/nanobanana

**Visual QA**
- microsoft/playwright-mcp: https://github.com/microsoft/playwright-mcp
- microsoft/playwright-cli: https://github.com/microsoft/playwright-cli
- ChromeDevTools/chrome-devtools-mcp: https://github.com/ChromeDevTools/chrome-devtools-mcp
- Argos MCP changelog, 2026-07-20 (snippet): https://argos-ci.com/changelog/2026-07-20-mcp-server
- Argos agent skills (snippet): https://argos-ci.com/docs/agents/agent-skills
- lost-pixel (archived): https://github.com/lost-pixel/lost-pixel
- Deque Axe MCP Server, paid (snippet): https://www.deque.com/blog/axe-devtools-for-web-now-includes-axe-mcp-server-for-earlier-fixes-and-faster-delivery/ and https://github.com/dequelabs/axe-mcp-server-public

**Component sources and libraries**
- magicuidesign/magicui: https://github.com/magicuidesign/magicui
- magicuidesign/mcp: https://github.com/magicuidesign/mcp
- DavidHDev/react-bits: https://github.com/DavidHDev/react-bits
- ibelick/motion-primitives: https://github.com/ibelick/motion-primitives
- airbnb/visx: https://github.com/airbnb/visx
- recharts/recharts: https://github.com/recharts/recharts

**Directories and lists**
- ComposioHQ/awesome-claude-skills: https://github.com/ComposioHQ/awesome-claude-skills
- hesreallyhim/awesome-claude-code: https://github.com/hesreallyhim/awesome-claude-code
- VoltAgent/awesome-agent-skills: https://github.com/VoltAgent/awesome-agent-skills
- travisvn/awesome-claude-skills: https://github.com/travisvn/awesome-claude-skills
- google-labs-code/stitch-skills: https://github.com/google-labs-code/stitch-skills
- chrisvoncsefalvay/claude-d3js-skill: https://github.com/chrisvoncsefalvay/claude-d3js-skill

**Added during the fact-check (retrieved 2026-10-17)**
- Claude Code MCP docs (SSE deprecation, scopes): https://code.claude.com/docs/en/mcp
- Claude Code plugin CLI reference (`--plugin-dir … plugin details`): https://code.claude.com/docs/en/plugins/cli-reference
- openai/openai-python, image model IDs and size rules (commit `bfada504`, 2026-10-17): https://github.com/openai/openai-python/blob/main/src/openai/types/image_generate_params.py
- Next.js AI agents guide bundled in `next@16.4.2` (`dist/docs/01-app/02-guides/ai-agents.md`), read from the npm tarball: https://registry.npmjs.org/next/-/next-16.4.2.tgz
- vercel-labs/agent-skills `react-view-transitions/references/nextjs.md` (`transitionTypes` from Next 16.2.0): https://github.com/vercel-labs/agent-skills/blob/main/skills/react-view-transitions/references/nextjs.md
- vercel-labs/skills CLI partner audits (`src/add.ts`, `src/telemetry.ts`): https://github.com/vercel-labs/skills
- Remotion client-side rendering docs source (stable from 4.0.491): https://github.com/remotion-dev/remotion/blob/main/packages/docs/docs/client-side-rendering/index.mdx
- Remotion 5.0 migration docs source: https://github.com/remotion-dev/remotion/blob/main/packages/docs/docs/5-0-migration.mdx
- black-forest-labs/flux2 README (klein and dev licensing): https://github.com/black-forest-labs/flux2
- BFL FLUX.2 pricing guide (snippet, updated 2026-01-18): https://help.bfl.ai/articles/7686530342-flux-2-pricing-guide
- Gemini image shutdown coverage (secondary, snippet): https://therouter.ai/news/gemini-image-api-deprecation-june-august-2026/
- Nano Banana 2.1 coverage (secondary, snippet): https://www.aifreeapi.com/en/posts/nano-banana-2-1
- motion-ai 14.2.0 npm tarball (MIT; contains `content/skills/motion/`): https://registry.npmjs.org/motion-ai/-/motion-ai-14.2.0.tgz

**npm registry metadata (retrieved 2026-10-17)**

| Package | Version | Date |
|---|---|---|
| `@playwright/mcp` | 0.0.83 | 2026-09-28 |
| `chrome-devtools-mcp` | 1.11.0 | 2026-10-15 |
| `@playwright/cli` | 0.1.22 | 2026-09-28 |
| `motion-ai` | 14.2.0 | 2026-10-15 |
| `agent-browser` | 0.39.1 | 2026-10-13 |
| `remotion`, `@remotion/player`, `@remotion/web-renderer` | 4.0.536 | 2026-10-16 |
| `shadcn` | 4.22.0 | 2026-10-16 |
| `skills` | 1.7.2 | 2026-10-09 |
| `hyperframes` | 0.8.168 | 2026-10-17 |
| `mcp-image` | 0.18.0 | 2026-10-08 |
| `next` | 16.4.2 | 2026-10-15 |
| `next-devtools-mcp` | 0.4.0 | 2026-06-24 |
| `motion` / `framer-motion` | 14.3.0 | 2026-10-15 |

Source: https://registry.npmjs.org/

## Fact-check notes (2026-10-17)

An independent fact-check was run on 2026-10-17. It checked the following against primary sources:

- `git ls-remote` and shallow clones of every repo cited;
- the GitHub repository search API, for stars, push dates, licenses and archived status;
- npm registry metadata and tarballs;
- both Anthropic plugin catalogues and this session's plugin directory;
- the Claude Code docs (skills, plugins install/security/marketplace reference/CLI reference, cloud environments, MCP);
- the official `openai-python` SDK.

Vendor doc sites (developers.openai.com, ai.google.dev, docs.bfl.ai, fal.ai, replicate.com, remotion.dev, unpkg, jsDelivr, Wikipedia) were still blocked from this sandbox. Claims that depend only on them stay marked "(unverified)". The `claude-api` skill confirms that the Claude API has no native image-generation output, which is consistent with the report's use of third-party image models.

**Corrections made**

1. **Remotion web renderer is not "experimental".** Remotion's docs source (`client-side-rendering/index.mdx`) says client-side rendering via `@remotion/web-renderer` is stable from 4.0.491. It is still limited to a subset of HTML/CSS. Fixed in the TL;DR and 4.4.1.
2. **Remotion free-license wording.** It covers individuals, for-profit organisations with up to 3 *employees* and non-profits. Added the other 5.0 changes from the migration doc: a license key must be passed to rendering APIs (`"free-license"` for free users), and Company License holders must enable telemetry.
3. **`claude-d3js-skill` date.** The "last update 2026-10-12" was GitHub's repo-metadata `updated_at`. The last commit is 2025-10-17 and the last push 2025-10-18.
4. **Anthropic `design` plugin contents.** The current HEAD has seven skills (`accessibility-review`, `design-critique`, `design-handoff`, `design-system`, `research-synthesis`, `user-research`, `ux-copy`) and no `commands/` directory. The listed `design-system-management`, `ux-writing` and six slash commands do not exist. The `design@knowledge-work-plugins` id is now verified from the repo's `marketplace.json`.
5. **Plugin auto-update defaults.** It is on for official marketplace names *except* `knowledge-work-plugins` and `first-party-plugins`, and on for marketplaces added from claude.ai.
6. **skills.sh "no security review".** The `skills` CLI fetches and prints partner audit results (Gen, Socket, Snyk) from skills.sh at install time. They are skipped when telemetry is disabled. Fixed in 3.5 and 4.7.
7. **Vercel license detail.** `web-design-guidelines` has no `license` frontmatter field (the other three do). Added that `vercel-labs/web-interface-guidelines` ships an MIT `LICENSE`, which covers vendoring `command.md`.
8. **`gpt-image-2` sizes.** The limit is not "max edge under 3840px". Per the SDK, it is a maximum of 3840x2160, both sides divisible by 16, and an aspect ratio between 1:3 and 3:1. Above 2560x1440 is experimental, and the same rules apply to both 2.5 models. Model IDs and snapshot dates (`gpt-image-2-2026-04-21`, `gpt-image-2.5-{sunburst,flare}-2026-09-08`) are now verified from the SDK. Also added `chatgpt-image-latest` to the 2026-12-01 shutdowns (search snippet).
9. **Replicate / SSE.** The Claude Code MCP docs do mark SSE as deprecated, so that "(unverified)" was removed. `deepfates/mcp-replicate` is archived, not just unmaintained.
10. **OpenAI `imagegen` skill license.** The frontmatter has no license field, but the folder ships an Apache-2.0 `LICENSE.txt`.
11. **HyperFrames and GSAP.** GSAP is one optional adapter (others are Lottie, Three.js, Anime.js, CSS, WAAPI). The npm package does not depend on it. Renderer uses `puppeteer-core`; Node `>=22` confirmed.
12. **shadcn MCP registries.** The current `mcp.mdx` names no specific third-party registries, so "Magic UI, Cult UI" was replaced with "any shadcn-compatible registry". Added that the skill is `user-invocable: false`.
13. **`frontend-design` tells wording.** The skill's first tell names an "acid-green or vermilion" accent, so the gold theme matches it by analogy, not literally. The other three tells match directly. The recommendation (rule on each deliberately) is unchanged.
14. **Figma rate limits** apply to read tools; some write tools are exempt.
15. **Skill listing limit.** The 1,536-character cap applies to `description` plus `when_to_use` combined.
16. **Image-model details.**
    - BFL pricing sources conflict, so prices are now marked unverified.
    - Added the open-weight FLUX.2 `[dev]` (32B, non-commercial).
    - Nano Banana 2's shutdown date is disputed across secondary sources.
    - Nano Banana 2 Lite is 1K-only.
    - fal's "about 1,000 models" is marked unverified.

**Recommendation changes (because of corrections)**

- **Motion skill provenance (4.2.1, 7.1 step 6, 7.2, section 5 matrix).** The ai-kit git repo has no license, but the byte-identical files ship in the MIT-licensed `motion-ai@14.2.0` npm tarball (`content/skills/motion/`). The vendoring source is now that tarball. Also noted that docs search and CSS-spring generation need the free hosted Motion MCP.
- **View transitions (4.1.3, 7.9).** `transitionTypes` on `next/link` needs Next 16.2.0+. On 16.1.1, use the skill's `startTransition` + `addTransitionType` + `router.push()` fallback until the upgrade.
- **Next upgrade side effect (4.1.7, 7.9).** From 16.3, `next dev` creates or updates a managed `AGENTS.md` block when it detects a coding agent (configurable via `agentRules`). The repo has no `AGENTS.md`, so the upgrade plan must decide to commit it or disable it.

The ranked shortlist and the rest of the recommendations are unchanged.

**Verified as stated (spot list)**

- Repo baseline: Next 16.1.1, React 19.2.3, Tailwind 4.3.2, framer-motion 12.42.2, Playwright 1.57.0, 12 commands, no `.claude/skills/`, `.mcp.json` or `components.json`, `Edit(./.claude/**)` allowed, no `toHaveScreenshot`, 12 archetypes, theme tokens.
- All commit SHAs, star counts and push dates in the report (except item 3).
- Catalogue sizes: 315 plugins in `claude-plugins-official`, 2,283 in `claude-community`. Catalogue pins: figma `f2789420`, chrome-devtools-mcp `a878bcad`, hyperframes `8d2b6e7b`, image-generation `721c3faf`. The official `playwright` plugin uses unpinned `@latest`.
- All npm versions and dates, and the cloud-session carry-over table.
- Skill frontmatter fields, the `allowed-tools` trust caveat, `disableSkillShellExecution`, `skillOverrides`, and `claude --plugin-dir <dir> plugin details <name>`.
- The `settings` marketplace source fields, and the community-catalogue SHA refusal.
- The shadcn `allowed-tools`/`!` injection, the Remotion markup quote, and the Remotion and HyperFrames install commands.
- `next-dev-loop` requirements (Next 16.3+ on Turbopack, agent-browser >=0.31.1), Playwright MCP/CLI and Chrome DevTools MCP flags, Figma tool names, and FLUX.2 `[klein]` licensing.

**Still unverified:** OpenAI shutdown dates and per-image prices, every Google image-model date, BFL prices, the fal/BFL/Replicate MCP endpoint details, Argos MCP details, Deque Axe MCP pricing terms and the GSAP license terms. All come from search snippets or secondary sources only.
