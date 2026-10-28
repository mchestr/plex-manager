import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';

/**
 * A stand-in for an OpenAI-compatible chat model, so the assistant specs can
 * send messages without a provider. The app calls the model from the server,
 * so Playwright's `page.route` cannot intercept the request; global setup
 * starts this on a free port and exports its base URL as `E2E_LLM_URL`, and a
 * spec points an `openai-compatible` chat `LLMProvider.baseUrl` at it.
 *
 * `POST .../chat/completions` answers every request with one text reply that
 * quotes the newest user message and counts the conversation's messages before
 * it, so a spec can tell the model saw the earlier turns. It never calls a tool.
 */

/** The reply to `question` after `earlier` messages of the conversation, so a spec can wait for it. */
export function mockLlmReply(question: string, earlier = 0): string {
  return `Checked for you: "${question}", after ${earlier} earlier messages. Every service answered.`;
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString('utf8');
  return text ? JSON.parse(text) : {};
}

interface MockMessage {
  role?: string;
  content?: unknown;
}

function textOf(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((part: { text?: unknown }) => (typeof part.text === 'string' ? part.text : '')).join('');
  }
  return '';
}

/** The request's newest user message, and how many user and assistant messages came before it. */
function lastQuestion(body: unknown): { question: string; earlier: number } {
  const turns = ((body as { messages?: MockMessage[] }).messages ?? []).filter(
    (message) => message.role === 'user' || message.role === 'assistant'
  );
  const last = turns.findLastIndex((message) => message.role === 'user');
  return { question: last === -1 ? '' : textOf(turns[last].content), earlier: Math.max(last, 0) };
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

/** Starts the mock on a free port on 127.0.0.1; its base URL ends in `/v1`. */
export async function startMockLlm(): Promise<{ url: string; server: Server }> {
  const server = createServer((req, res) => {
    void handle(req, res).catch(() => send(res, 500, { error: { message: 'mock error' } }));
  });

  async function handle(req: IncomingMessage, res: ServerResponse) {
    const { pathname } = new URL(req.url ?? '/', 'http://mock');
    if (req.method !== 'POST' || !pathname.endsWith('/chat/completions')) {
      return send(res, 404, { error: { message: `No mock for ${req.method} ${pathname}` } });
    }
    const body = await readJson(req);
    const { question, earlier } = lastQuestion(body);
    return send(res, 200, {
      id: 'chatcmpl-e2e',
      object: 'chat.completion',
      created: Math.floor(Date.now() / 1000),
      model: (body as { model?: string }).model ?? 'gpt-e2e',
      choices: [{ index: 0, message: { role: 'assistant', content: mockLlmReply(question, earlier) }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 },
    });
  }

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as { port: number };
  return { url: `http://127.0.0.1:${port}/v1`, server };
}
