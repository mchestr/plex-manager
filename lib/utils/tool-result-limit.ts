/**
 * The size limit on a tool result, shared by the MCP endpoint and the
 * assistant tools that answer through it.
 *
 * Every result lands in a model's context, and Claude Code warns above 10,000
 * tokens of MCP output, so the MCP endpoint refuses a read's result over
 * {@link MAX_RESULT_CHARS} characters (`lib/mcp/result-limit.ts`). The
 * assistant's Plex, Tautulli, Sonarr and Radarr tools are MCP tools too, so
 * their replies are sized from it (`lib/chatbot/executors`). It lives here so
 * the assistant does not depend on the MCP module.
 *
 * @module lib/utils/tool-result-limit
 */

/** The most characters a tool result may have (about 10k tokens of JSON), unless the tool declares more. */
export const MAX_RESULT_CHARS = 40_000
