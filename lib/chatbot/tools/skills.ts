import "server-only"

import { type RegisteredTool } from "./types"

/**
 * Admin-only tools over the skill sources' `SKILL.md` folders; never
 * `discordSafe`, and not offered over `/api/mcp` (`lib/mcp/assistant-tools.ts`):
 * skills are for the admin web chat only.
 */
export const SKILL_TOOLS: RegisteredTool[] = [
  {
    type: "function",
    permission: "assistant:tools:admin",
    function: {
      name: "load_skill",
      description:
        "Load one of the skills listed under SKILLS, by name, and follow its instructions. Call it before acting on a request that matches a skill.",
      parameters: {
        type: "object",
        properties: { name: { type: "string", description: "The skill's name, exactly as SKILLS lists it" } },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    permission: "assistant:tools:admin",
    function: {
      name: "read_skill_file",
      description: "Read a supporting file of a loaded skill, by the skill name and one of the paths load_skill listed.",
      parameters: {
        type: "object",
        properties: {
          skill: { type: "string", description: "The skill's name" },
          path: { type: "string", description: "One of the paths in load_skill's files, exactly as listed" },
        },
        required: ["skill", "path"],
      },
    },
  },
]

/**
 * The tools whose results the conversation wraps as `admin_skill` (an
 * administrator's instructions) instead of `untrusted_data`. A fixed set,
 * matched by exact name, so no other tool's result, an MCP tool's included
 * (always named `mcp_…`), can take on that trust.
 */
export const SKILL_TOOL_NAMES: ReadonlySet<string> = new Set(["load_skill", "read_skill_file"])
