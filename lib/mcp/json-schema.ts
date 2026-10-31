import { z } from "zod"

/** The key a non-object input is wrapped under, since MCP arguments are always an object. */
const WRAPPED_INPUT_KEY = "input"

export interface ToolInputSchema {
  inputSchema: Record<string, unknown>
  /** The argument object as the schema expects it. */
  unwrap: (args: Record<string, unknown>) => unknown
}

const EMPTY_OBJECT = { type: "object", properties: {}, additionalProperties: false }

/**
 * A tool's JSON Schema from a Zod schema, as the caller sends it (`io: "input"`).
 * An input that is not an object is wrapped under {@link WRAPPED_INPUT_KEY}.
 */
export function toolInputSchema(schema: z.ZodType | null): ToolInputSchema {
  if (!schema) return { inputSchema: EMPTY_OBJECT, unwrap: () => undefined }
  const json = z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }) as Record<string, unknown>
  delete json.$schema
  if (json.type === "object") return { inputSchema: json, unwrap: (args) => args }
  const optional = schema.safeParse(undefined).success
  return {
    inputSchema: {
      type: "object",
      properties: { [WRAPPED_INPUT_KEY]: json },
      ...(optional ? {} : { required: [WRAPPED_INPUT_KEY] }),
      additionalProperties: false,
    },
    unwrap: (args) => args[WRAPPED_INPUT_KEY],
  }
}
