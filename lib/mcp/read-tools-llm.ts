/**
 * The LLM usage reads as MCP tools: `list_llm_usage` pages through calls
 * without their prompt and response text, which can run to tens of thousands
 * of characters each, and `get_llm_usage` reads one call with that text
 * clipped, so either stays under the size cap (`lib/mcp/result-limit.ts`).
 * Both loaders audit a read of a member's conversation (`lib/data/llm-usage.ts`).
 *
 * @module lib/mcp/read-tools-llm
 */

import "server-only"

import { z } from "zod"

import { getLLMUsageById, getLLMUsageRecords } from "@/lib/data/llm-usage"
import { clip, idArg, readTool } from "@/lib/mcp/read-tool"
import type { McpTool } from "@/lib/mcp/types"

/** The most of a prompt or response `get_llm_usage` returns. */
const LLM_TEXT_MAX = 15_000

const llmUsageInput = z.object({
  page: z.number().int().min(1).max(10_000).default(1),
  pageSize: z.number().int().min(1).max(50).default(20),
  userId: idArg.optional(),
  conversationId: idArg.optional(),
})

type LlmUsageRow = Awaited<ReturnType<typeof getLLMUsageRecords>>["records"][number]

/** An LLM call without its prompt and response, which `get_llm_usage` reads. */
function llmUsageRow({ prompt, response, user, chatConversation: _conversation, ...row }: LlmUsageRow) {
  return { ...row, user: { id: user.id, name: user.name }, promptChars: prompt?.length ?? 0, responseChars: response?.length ?? 0 }
}

/** The LLM usage read tools. */
export function llmReadTools(): McpTool[] {
  return [
    readTool({
      name: "list_llm_usage",
      description:
        "LLM calls, newest first, with model, tokens, cost, outcome and the sizes of the prompt and response; optionally one user's or one conversation's. Pages with page and pageSize; get_llm_usage reads one call's prompt and response.",
      input: llmUsageInput,
      read: async (input) => {
        const { records, pagination } = await getLLMUsageRecords(input)
        return { pagination, records: records.map(llmUsageRow) }
      },
    }),
    readTool({
      name: "get_llm_usage",
      description: `One LLM call by id, with its prompt and response (each up to ${LLM_TEXT_MAX} characters; promptChars and responseChars give the full lengths).`,
      input: z.object({ usageId: idArg }),
      read: async ({ usageId }) => {
        const record = await getLLMUsageById(usageId)
        if (!record) return null
        const { prompt, response, user, ...rest } = record
        const promptClip = clip(prompt, LLM_TEXT_MAX)
        const responseClip = clip(response, LLM_TEXT_MAX)
        return {
          ...rest,
          user: { id: user.id, name: user.name },
          prompt: promptClip.text,
          promptChars: promptClip.chars,
          promptTruncated: promptClip.truncated,
          response: responseClip.text,
          responseChars: responseClip.chars,
          responseTruncated: responseClip.truncated,
        }
      },
    }),
  ]
}
