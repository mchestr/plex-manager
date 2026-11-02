/**
 * The judge's prompt for one conversation: the assistant's system prompt and
 * tool catalog as they are today, the findings already raised, and the
 * transcript with each assistant turn's tool log.
 *
 * ## Budget
 *
 * `system` and `prompt` together never pass 120,000 characters. They are
 * filled in this order:
 *
 * 1. the assistant's system prompt and catalog;
 * 2. the newest turn (a user message and its answers) whole. Only when it
 *    alone would pass the cap are its pieces (message text, tool args and
 *    results) cut: short ones stay whole and long ones are cut to one length
 *    (`fitSection`, `lib/judge/fit.ts`);
 * 3. the "Already raised" lines, while they fit;
 * 4. earlier turns, newest first, with message text whole and each tool
 *    result cut to 2 KB, until one does not fit. It and every older turn are
 *    left out, and a line says how many.
 *
 * Every message is labelled with its absolute index (`[#7 assistant]`), so a
 * finding's `messageIndex` is the same whatever was left out.
 *
 * ## Fencing
 *
 * Every content block is fenced (`<transcript>`, `<tool_result>`,
 * `<already_raised>`, `<assistant_system_prompt>`, `<tool_catalog>`), and
 * every piece of content is neutralised first (`lib/judge/fence.ts`): a tag,
 * label, note or `[truncated]` mark inside it is changed so it cannot pass for
 * the builder's own, and each block opens and closes exactly once. A tool
 * result stays JSON that parses.
 *
 * @module lib/judge/build-prompt
 */

import { attribute, NOTES, neutralise, omittedTurns, TRUNCATED } from "@/lib/judge/fence"
import { type Fit, fitSection, fitWithin, marked } from "@/lib/judge/fit"
import { JUDGE_SYSTEM_PROMPT } from "@/lib/judge/prompts/v1"
import { type ToolLogEntry } from "@/lib/judge/tool-log"
import { type ChatTool } from "@/lib/llm/chat"

export type JudgeMessage = {
  id: string
  index: number
  role: "user" | "assistant"
  content: string
  /** Null for a turn stored before the tool log existed; `[]` for a turn that called no tools. */
  toolLog: ToolLogEntry[] | null
  createdAt: Date
}

export type PriorFinding = { type: string; messageIndex: number; claim: string; status: string }

type JudgePromptInput = {
  messages: JudgeMessage[]
  /** The assistant's prompt and tools as its owner gets them today (`getAdminAssistantContext`). */
  systemPrompt: string
  tools: ChatTool[]
  prior: PriorFinding[]
  /** The latest `done` review's `reviewedThrough`; messages up to it are context. */
  previousReviewedThrough: Date | null
}

type JudgePrompt = {
  /** The judge's own rules, and the assistant's prompt and catalog, the "Already raised" block and the transcript. */
  system: string; prompt: string
  /** Every message index the prompt included. */
  window: Set<number>
  /** By message index, each tool result exactly as the judge was sent it. */
  sentToolText: Map<number, string[]>
  /** Whether any assistant message has a tool log (`[]` included). */
  hasToolEvidence: boolean
}

const PROMPT_CAP = 120_000
const EARLIER_RESULT_LIMIT = 2_048

type Drawn = { text: string; results: Map<number, string[]> }

const fenced = (tag: string, body: string) => `<${tag}>\n${body}\n</${tag}>`

function drawMessage(message: JudgeMessage, fit: Fit, resultLimit: number, reviewed: boolean) {
  const label = `[#${message.index} ${message.role}]${reviewed ? ` ${NOTES.reviewed}` : ""}`
  const lines = [label, marked(fit(neutralise(message.content)))]
  const results: string[] = []
  if (message.role === "assistant") {
    if (message.toolLog === null) lines.push(NOTES.noLog)
    else if (message.toolLog.length === 0) lines.push(NOTES.noTools)
    for (const call of message.toolLog ?? []) {
      const args = fit(neutralise(call.args))
      const result = fit(neutralise(call.result), resultLimit)
      results.push(result.text)
      const cut = call.truncated === true || args.cut || result.cut
      lines.push(`<tool_result tool="${attribute(call.tool)}" ok="${call.ok}">\nargs: ${args.text}\nresult: ${result.text}${cut ? `\n${TRUNCATED}` : ""}\n</tool_result>`)
    }
  }
  return { text: lines.join("\n"), results }
}

/** A turn is a user message and the answers after it. */
function turnsOf(messages: JudgeMessage[]): JudgeMessage[][] {
  const turns: JudgeMessage[][] = []
  for (const message of messages) {
    const last = turns.at(-1)
    if (message.role === "user" || !last) turns.push([message])
    else last.push(message)
  }
  return turns
}

function drawContext(systemPrompt: string, tools: ChatTool[]) {
  const catalog = tools.map((tool) => `- ${tool.function.name}: ${tool.function.description}`).join("\n")
  return (fit: Fit): Drawn => {
    const prompt = fenced("assistant_system_prompt", marked(fit(neutralise(systemPrompt))))
    const toolList = fenced("tool_catalog", marked(fit(neutralise(catalog))))
    return { text: `The assistant's system prompt, as it is today:\n${prompt}\n\nThe assistant's tool catalog, as it is today:\n${toolList}`, results: new Map() }
  }
}

function assemble(context: string, raised: string[] | null, transcript: string[], omitted: number): string {
  return [
    context,
    raised && `Already raised, don't repeat:\n${fenced("already_raised", raised.join("\n"))}`,
    `The conversation under review:\n${fenced("transcript", [omitted > 0 ? omittedTurns(omitted) : null, ...transcript].filter(Boolean).join("\n\n"))}`,
    "Review the messages in the transcript and return your findings.",
  ].filter((part) => part !== null).join("\n\n")
}

export function buildJudgePrompt({ messages, systemPrompt, tools, prior, previousReviewedThrough }: JudgePromptInput): JudgePrompt {
  const turns = turnsOf(messages)
  const reviewed = (message: JudgeMessage) => previousReviewedThrough !== null && message.createdAt <= previousReviewedThrough
  const drawTurn = (turn: JudgeMessage[], resultLimit: number) => (fit: Fit): Drawn => {
    const results = new Map<number, string[]>()
    const parts = turn.map((message) => {
      const drawn = drawMessage(message, fit, resultLimit, reviewed(message))
      if (message.role === "assistant" && message.toolLog !== null) results.set(message.index, drawn.results)
      return drawn.text
    })
    return { text: parts.join("\n\n"), results }
  }

  // The fixed text is charged first; each item below is charged with its separator ("\n\n" in the transcript, "\n" in the list)
  let budget = PROMPT_CAP - JUDGE_SYSTEM_PROMPT.length - assemble("", prior.length > 0 ? [] : null, [], turns.length).length
  const context = fitSection(drawContext(systemPrompt, tools), budget).text
  budget -= context.length

  const kept: { turn: JudgeMessage[]; drawn: Drawn }[] = []
  const newest = turns.at(-1)
  const newestDrawn = newest && fitSection(drawTurn(newest, Infinity), budget - 2)
  if (newest && newestDrawn && newestDrawn.text.length + 2 <= budget) {
    kept.push({ turn: newest, drawn: newestDrawn })
    budget -= newestDrawn.text.length + 2
  }

  const raised: string[] = []
  for (const finding of prior) {
    const line = `- [#${finding.messageIndex}] ${finding.type} (${finding.status}): ${neutralise(finding.claim)}`
    if (line.length + 1 > budget) break
    raised.push(line)
    budget -= line.length + 1
  }

  for (const turn of kept.length > 0 ? turns.slice(0, -1).reverse() : []) {
    const drawn = drawTurn(turn, EARLIER_RESULT_LIMIT)(fitWithin(Infinity))
    if (drawn.text.length + 2 > budget) break
    kept.unshift({ turn, drawn })
    budget -= drawn.text.length + 2
  }

  return {
    system: JUDGE_SYSTEM_PROMPT,
    prompt: assemble(context, prior.length > 0 ? raised : null, kept.map(({ drawn }) => drawn.text), turns.length - kept.length),
    window: new Set(kept.flatMap(({ turn }) => turn.map((message) => message.index))),
    sentToolText: new Map(kept.flatMap(({ drawn }) => [...drawn.results])),
    hasToolEvidence: messages.some((message) => message.role === "assistant" && message.toolLog !== null),
  }
}
