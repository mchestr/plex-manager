/**
 * Parse and validate the LLM's creative output against the v2 schema.
 *
 * Fails loudly: any JSON or schema violation is returned as an error with
 * the offending paths so the wrapped row can be marked `failed` with a
 * debuggable message — no silent degradation to empty sections.
 */

import {
  WrappedLLMOutput,
  wrappedLLMOutputSchema,
} from "@/lib/wrapped/llm-output-schema"

export type ParseLLMOutputResult =
  | { success: true; output: WrappedLLMOutput }
  | { success: false; error: string; issues?: string[] }

/** Strip optional ```json fences around the payload */
function stripCodeFences(raw: string): string {
  let text = raw.trim()
  if (text.startsWith("```json")) {
    text = text.slice(7)
  } else if (text.startsWith("```")) {
    text = text.slice(3)
  }
  if (text.endsWith("```")) {
    text = text.slice(0, -3)
  }
  return text.trim()
}

export function parseWrappedLLMOutput(raw: string): ParseLLMOutputResult {
  const text = stripCodeFences(raw)

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    return {
      success: false,
      error: `LLM response is not valid JSON: ${
        error instanceof Error ? error.message : "parse error"
      }`,
    }
  }

  const result = wrappedLLMOutputSchema.safeParse(parsed)
  if (!result.success) {
    const issues = result.error.issues.map(
      (issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`
    )
    return {
      success: false,
      error: `LLM response failed schema validation: ${issues.slice(0, 5).join("; ")}`,
      issues,
    }
  }

  return { success: true, output: result.data }
}
