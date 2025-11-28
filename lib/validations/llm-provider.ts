import { z } from "zod"

export const llmProviderSchema = z.object({
  provider: z.enum(["openai"], {
    message: "Please select a provider",
  }),
  apiKey: z.string().min(1, "API key is required"),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(1).max(100000).optional(),
})

export type LLMProviderInput = z.infer<typeof llmProviderSchema>

