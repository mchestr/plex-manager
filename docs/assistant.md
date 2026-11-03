# Admin assistant sources

The admin assistant (Admin, Assistant: `/admin/assistant`) can read this app's own
data, call tools on MCP servers you connect, search a knowledge base and follow
skills kept on GitHub. All of it is admin-only: the Discord `/assistant` command
never gets these tools (`DISCORD_SAFE_TOOLS` is derived from each tool's
`discordSafe` flag, and none of these set it).

## App data tools

| Tool | Answers |
|---|---|
| `get_app_invites` | Which invites are active, expired, used up or expire within N days |
| `get_app_member` | A member's services, subscription and access state, and their latest Rewind runs with errors |
| `get_app_failed_jobs` | The newest failed background jobs |

They read through `lib/data/assistant-data.ts`, which checks `assertAdmin()`.
Results carry no emails, tokens or Stripe ids. Each call writes an
`ASSISTANT_DATA_READ` audit event with the tool name only.

## MCP servers

Settings, Assistant sources, MCP servers, Add.

- **URL:** a Streamable HTTP MCP endpoint, `http` or `https`, no credentials or
  query string. The legacy SSE transport and stdio are not supported.
- **Auth header:** an optional header name and value (for example
  `Authorization` and `Bearer ...`). The value is encrypted at rest. Like the
  other service keys, a blank value is kept only while the URL's origin is
  unchanged.
- **Tools:** after saving, open the server and choose List tools. A tool is
  off until you tick "Allow <tool>" and save, and tools that do not declare `readOnlyHint` are
  marked "Can change data". The assistant sees `mcp_<server>_<tool>` and the
  call is audit-logged (`ASSISTANT_MCP_CALL`) by server and tool.

Everything an MCP server returns is untrusted data. Results reach the model
wrapped as `untrusted_data` like every tool result except `load_skill` and
`read_skill_file`, which arrive as `admin_skill`. Tool descriptions are cut to
one short line, and a failing call returns a fixed code, never the server's
text. Only enable servers and tools you trust.

## Knowledge bases

Settings, Assistant sources, Knowledge bases, Add. Give a GitHub repository
(`mchestr/knowledgebase`), a branch or tag, an optional folder and, for a
private repository, a token (encrypted, sent only to `api.github.com`).

`search_knowledge_base` ranks the Markdown files by keyword and returns the
path, title, snippets and a GitHub URL; `read_knowledge_doc` reads one file. The
prompt tells the assistant to cite the URL. A memini or other knowledge MCP
server can be connected as an MCP server instead.

The file list and files are cached for ten minutes per process. A knowledge
base pinned to a commit (its ref is the full 40-character commit SHA, in
lowercase) is cached at that commit instead, with no expiry, since a commit
cannot change. Saving it again does not re-read it unless its repository or
folder changed, and what was read with a token stays cached after the token is
removed, until it is pushed out of the cache or the process restarts. After
GitHub rate-limits a read, the app waits a minute before asking GitHub again;
saving the knowledge base asks again at once.

## Skills

Settings, Assistant sources, Skills, Add. A skill source is a GitHub repository
of Agent Skills: folders that each hold a `SKILL.md`, whose frontmatter gives
the skill's `name` and `description` and whose Markdown body is the
instructions. Give the repository, a commit, tag or branch, an optional folder
and, for a private repository, a token (encrypted, sent only to
`api.github.com`). Skills are instructions only: nothing in a skill runs.

- The file must be named exactly `SKILL.md` (`skill.md` is not a skill). Its
  folder is the skill's folder, and the other Markdown files under it, except
  those inside a nested skill's folder, are the skill's supporting files.
- `name` is 1 to 64 lowercase letters, digits and hyphens, starting with a
  letter or digit. `description` is 1 to 1,024 characters. The frontmatter is
  plain YAML of at most 4,096 characters, with no aliases or repeated keys.

### Pin a tag or commit

The assistant follows a skill as an administrator's instructions. The Add and
Edit forms both say so: "The assistant follows skills as instructions. Add only
repositories you control, and pin a tag or commit." A commit (its full
40-character SHA) keeps the skills fixed until you change it. A tag changes
only if someone moves it, and a branch whenever anyone pushes to it. A row
whose ref is not a full commit SHA, a tag included, shows a standing "Follows a
moving ref" badge. A SHA is saved in lowercase.

### Check skills and Refresh

- **Check skills** on a row reads every active source in full, without the
  chat's five-second bound, and shows that row's part: the full commit SHA its
  ref resolves to now ("Not read" when it could not be resolved), whether the
  ref can move, the skills found and any problems. On a source that is off, it
  says so and reads nothing.
- **Refresh** makes the next read resolve a branch or tag again, without
  waiting out its ten minutes, and forgets a remembered rate limit or failed
  load. At a pinned commit there is nothing new to read, so it re-reads
  nothing.
- Saving, removing and Refresh are audited as `ASSISTANT_SOURCE_CHANGED` with
  `kind: "skill"`, never with the token.

### In the chat

Skills are for the admin web chat only: never in Discord, never for a Support
user and not over `/api/mcp`. An admin's system prompt gains a SKILLS section,
one line per skill (`- <name>: <description>`), telling the assistant to load a
matching skill first and follow it. Two tools go with it:

- `load_skill({ name })` returns the skill's body after the frontmatter (at
  most 12,000 characters, with `truncated`), its github.com link at the commit,
  and its supporting files as paths relative to its folder, at most 50 in path
  order (`filesTruncated` when there are more).
- `read_skill_file({ skill, path })` reads one of those files, at most 12,000
  characters, with `truncated`. The path must equal, exactly and
  case-sensitively, one that `load_skill` listed. Nothing is normalised, so
  `..`, `./` or another case never matches.

Their results reach the model wrapped as `admin_skill` instead of
`untrusted_data`, and the admin prompt adds a fourth tool-data rule: what
arrives inside `admin_skill` is an administrator's instructions, to be
followed. It cannot widen the assistant's access, since tools the admin does
not have stay unavailable, and data returned by tools a skill tells the
assistant to call is still `untrusted_data`. The wrapper is picked by exact
tool name from a fixed set in code, never from the result. MCP tools are
always named `mcp_...`, so no other tool can take on that trust.

Each `load_skill` and `read_skill_file` call writes an `ASSISTANT_DATA_READ`
audit event with the tool name, the skill, the repo path read and the commit as
`owner/repo@<full SHA>`, so the audit shows exactly what was followed.

### What a skill can do

A skill can direct the assistant to use any tool the admin has, including ones
that change data, with no extra confirmation step. Whoever can change the
repository at the ref can steer the assistant that far, so pin a commit.
Pinning a commit, the full commit SHA shown in Check skills, and the
`ASSISTANT_DATA_READ` audit of every skill load are the controls; the form
warning alone is not.

Supporting files read with `read_skill_file` carry the same trust as
`SKILL.md`: same repository, same commit, same wrapper. Only the first 50
supporting files (in path order) are listed and readable. Only Markdown
(`.md`, `.mdx`) of at most 200 KB is listed, as for knowledge bases, so
scripts, JSON, YAML or templates a skill bundles cannot be read.

### Which skills the assistant sees

Only active sources are read, in code-point order of their names (capitals
sort before lowercase), and each source's skills in path order.

- At most 50 `SKILL.md` files are read per catalogue load, across all sources.
  The rest are not read (`not_read`). A source lists at most 300 Markdown
  files, and GitHub may cut a very large repository's listing
  (`listing_truncated`); set a folder to narrow it.
- When two sources define the same skill name, the source whose name sorts
  first wins, so renaming a source can change the winner. Check skills shows
  the hidden one (`duplicate_name`). A hidden duplicate still uses one of the
  50 reads.
- The SKILLS section is capped at 6,000 characters, its header included. Each
  description is collapsed to one line, loses any run of `===` and is cut to
  300 characters. At the first skill that does not fit, it and every later
  skill are left out (`not_in_prompt`), and `load_skill` refuses a skill left
  out of the prompt like an unknown name.
- A body longer than 12,000 characters is still listed (`too_long`), but
  `load_skill` returns only its start.
- A `SKILL.md` whose frontmatter does not parse is skipped
  (`invalid_frontmatter`), and so is a source or file GitHub does not return
  (`unreachable`, or `rate_limited` for GitHub's rate limit).

The chat never says why a skill is missing: Check skills is where `not_read`,
`not_in_prompt`, duplicates and read failures show.

### Caching and cost

Every read goes to `api.github.com`. Each catalogue load resolves the ref once,
then lists and reads at that commit, so the skills listed, loaded and shown in
Check skills all come from one commit.

- A pinned commit costs one tree read and one read per `SKILL.md` once per
  process (each container and restart), then nothing until those entries are
  pushed out of the reader's caches (20 listings and 400 files, oldest inserted
  first), which knowledge-base reads share. Each entry pushed out costs one
  re-read.
- A branch or tag costs one ref check every ten minutes, plus those reads again
  whenever it moves to a new commit.
- A supporting file is read only when the assistant asks for it, then cached
  at the commit the same way.
- A token raises GitHub's limit from 60 to 5,000 requests an hour. After GitHub
  rate-limits a read, the app waits a minute before asking GitHub again.
- Removing a token from a private source does not drop skills already read at
  a pinned commit until the cached entries are evicted or the process restarts.

On a fresh process the first turns may run without the SKILLS section while
the catalogue loads, since a turn waits at most five seconds for it. Usually
the next turn has it; on a slow GitHub with many skills, warming up can take a
few turns. After a failed or slow load the assistant answers without skills for
up to 30 seconds before trying again. Saving or refreshing any skill source
tries again at once.

The read limiter (at most 8 `SKILL.md` reads at once), the remembered failures
(a rate limit for a minute, a failed catalogue load for 30 seconds) and the
shared in-flight reads are per process, like the caches: one set per web
container.
