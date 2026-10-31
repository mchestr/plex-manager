### Added

- **MCP endpoint:** Plex Manager is now an MCP server at `/api/mcp`. Make a personal API token in Admin, Settings, API access, add it to Claude Code with the command shown, and Claude can run every admin action you can (make and send invites, look up members, change settings, retry jobs), with the same checks and audit entries as the admin UI. See `docs/mcp.md`.
