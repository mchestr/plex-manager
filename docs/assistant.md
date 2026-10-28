# Admin assistant sources

The admin assistant (Admin, Assistant: `/admin/assistant`) can read this app's own
data, call tools on MCP servers you connect, and search a knowledge base. All of
it is admin-only: the Discord `/assistant` command never gets these tools
(`DISCORD_SAFE_TOOLS` is derived from each tool's `discordSafe` flag, and none of
these set it).

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
wrapped as `untrusted_data` like every other tool result, tool descriptions are
cut to one short line, and a failing call returns a fixed code, never the
server's text. Only enable servers and tools you trust.

## Knowledge bases

Settings, Assistant sources, Knowledge bases, Add. Give a GitHub repository
(`mchestr/knowledgebase`), a branch or tag, an optional folder and, for a
private repository, a token (encrypted, sent only to `api.github.com`).

`search_knowledge_base` ranks the Markdown files by keyword and returns the
path, title, snippets and a GitHub URL; `read_knowledge_doc` reads one file. The
prompt tells the assistant to cite the URL. The file list and files are cached
for ten minutes per process. A memini or other knowledge MCP server can be
connected as an MCP server instead.
