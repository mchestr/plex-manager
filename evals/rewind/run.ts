/**
 * `npm run eval:rewind`: the Rewind eval harness on the command line (P5.13).
 *
 *   npm run eval:rewind -- --model=anthropic:claude-sonnet-5-5 [--judge=openai:gpt-6-astra]
 *     [--fixtures=heavy,median] [--effort=low] [--record] [--yes] [--allow-unpriced]
 *   npm run eval:rewind -- --replay=hand        (offline: replays recordings/hand, no key, no cost)
 *
 * Keys come from the environment: ANTHROPIC_API_KEY, OPENAI_API_KEY,
 * GOOGLE_GENERATIVE_AI_API_KEY; an OpenAI-compatible server (`ollama:<tag>`)
 * reads OPENAI_COMPATIBLE_BASE_URL (default http://localhost:11434/v1) and
 * an optional OPENAI_COMPATIBLE_API_KEY. See evals/rewind/README.md.
 */

import "dotenv/config"

import { mkdir, writeFile } from "node:fs/promises"
import path from "node:path"
import { createInterface } from "node:readline/promises"
import { parseArgs } from "node:util"

import type { LLMProviderId } from "@/lib/llm/models"

const KEY_ENV: Record<LLMProviderId, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  google: "GOOGLE_GENERATIVE_AI_API_KEY",
  "openai-compatible": "OPENAI_COMPATIBLE_API_KEY",
}

const ROOT = path.join(process.cwd(), "evals", "rewind")

async function main() {
  const { values } = parseArgs({
    options: {
      model: { type: "string" },
      replay: { type: "string" },
      judge: { type: "string" },
      fixtures: { type: "string" },
      effort: { type: "string" },
      record: { type: "boolean", default: false },
      yes: { type: "boolean", default: false },
      "allow-unpriced": { type: "boolean", default: false },
    },
  })

  // The model registry imports the Prisma client, which needs a URL to load; it never connects without a query
  process.env.DATABASE_URL ??= "postgresql://eval@localhost:5432/eval_unused"

  const [{ runEval }, { evalRow }, { resolveModel }, { loadFixtures }] = await Promise.all([
    import("./run-eval"),
    import("./harness"),
    import("@/lib/llm/registry"),
    import("./__tests__/load-fixtures"),
  ])

  const results = await runEval(
    {
      model: values.model,
      replay: values.replay,
      judge: values.judge,
      fixtures: values.fixtures?.split(",").map((f) => f.trim()).filter(Boolean),
      effort: values.effort,
      record: values.record,
      yes: values.yes,
      allowUnpriced: values["allow-unpriced"],
    },
    loadFixtures(),
    {
      log: (line) => console.log(line),
      confirm: async (question) => {
        const rl = createInterface({ input: process.stdin, output: process.stdout })
        const answer = await rl.question(`${question} [y/N] `)
        rl.close()
        return /^y(es)?$/i.test(answer.trim())
      },
      now: () => new Date(),
      liveDeps: (ref, effort) => {
        const apiKey = process.env[KEY_ENV[ref.provider]]
        if (!apiKey && ref.provider !== "openai-compatible") throw new Error(`Set ${KEY_ENV[ref.provider]} to call ${ref.provider}`)
        const row = evalRow(ref, { apiKey, baseUrl: process.env.OPENAI_COMPATIBLE_BASE_URL ?? "http://localhost:11434/v1", effort })
        return { resolve: async (_purpose, override) => resolveModel(row, override.model ?? ref.id), record: async () => {} }
      },
      writeResults: async (fileName, data) => {
        const dir = path.join(ROOT, "results")
        await mkdir(dir, { recursive: true })
        await writeFile(path.join(dir, fileName), `${JSON.stringify(data, null, 2)}\n`)
        console.log(`Wrote evals/rewind/results/${fileName}`)
      },
      writeRecording: async (set, recording) => {
        const dir = path.join(ROOT, "recordings", set)
        await mkdir(dir, { recursive: true })
        await writeFile(path.join(dir, `${recording.fixture}.json`), `${JSON.stringify(recording, null, 2)}\n`)
      },
    }
  )
  process.exitCode = results === null ? 1 : 0
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
