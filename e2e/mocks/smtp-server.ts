import { createServer as createHttpServer, type Server as HttpServer } from 'node:http';
import { createServer, type Server, type Socket } from 'node:net';

/**
 * A stand-in mail server. `playwright.config.ts` points the web server's
 * `SMTP_URL` at `127.0.0.1:E2E_SMTP_PORT` (default 2526) when the config
 * loads, before global setup starts this sink on that port. It speaks just
 * enough SMTP for nodemailer, with no STARTTLS and no login, and keeps every
 * message in memory.
 *
 * Specs read the messages from `GET {E2E_SMTP_INBOX_URL}/messages` and empty
 * the inbox with `DELETE {E2E_SMTP_INBOX_URL}/messages`; global setup exports
 * the URL.
 */

/** One message as the sink got it: the envelope and the raw message, headers and body. */
export interface SinkMessage {
  from: string;
  to: string[];
  raw: string;
}

/** The fixed SMTP port the web server's `SMTP_URL` names. */
export const smtpSinkPort = () => Number(process.env.E2E_SMTP_PORT || 2526);

const address = (line: string) => /<([^>]*)>/.exec(line)?.[1] ?? '';

function serve(socket: Socket, inbox: SinkMessage[]) {
  let buffer = '';
  let data: string[] | null = null;
  let envelope: { from: string; to: string[] } = { from: '', to: [] };
  const reply = (line: string) => socket.write(`${line}\r\n`);

  const command = (line: string) => {
    const verb = line.slice(0, 4).toUpperCase();
    if (verb === 'EHLO' || verb === 'HELO') return reply('250 sink.example.test');
    if (verb === 'MAIL') {
      envelope = { from: address(line), to: [] };
      return reply('250 OK');
    }
    if (verb === 'RCPT') {
      envelope.to.push(address(line));
      return reply('250 OK');
    }
    if (verb === 'DATA') {
      data = [];
      return reply('354 End data with <CR><LF>.<CR><LF>');
    }
    if (verb === 'RSET') return reply('250 OK');
    if (verb === 'NOOP') return reply('250 OK');
    if (verb === 'QUIT') {
      reply('221 Bye');
      return socket.end();
    }
    return reply('502 Command not implemented');
  };

  socket.setEncoding('utf8');
  socket.on('data', (chunk: string) => {
    buffer += chunk;
    let end: number;
    while ((end = buffer.indexOf('\r\n')) !== -1) {
      const line = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      if (data === null) {
        command(line);
      } else if (line === '.') {
        inbox.push({ ...envelope, raw: data.join('\r\n') });
        data = null;
        reply('250 OK queued');
      } else {
        data.push(line.startsWith('..') ? line.slice(1) : line);
      }
    }
  });
  socket.on('error', () => socket.destroy());
  reply('220 sink.example.test ESMTP');
}

/** Starts the sink on `port` and its inbox reader on a free port. */
export async function startSmtpSink(port = smtpSinkPort()): Promise<{ smtp: Server; http: HttpServer; inboxUrl: string }> {
  const inbox: SinkMessage[] = [];
  const smtp = createServer((socket) => serve(socket, inbox));
  await new Promise<void>((resolve, reject) => {
    smtp.once('error', reject);
    smtp.listen(port, '127.0.0.1', resolve);
  });

  const http = createHttpServer((req, res) => {
    if (req.url !== '/messages') {
      res.writeHead(404).end();
      return;
    }
    if (req.method === 'DELETE') inbox.length = 0;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(inbox));
  });
  await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
  const { port: httpPort } = http.address() as { port: number };
  return { smtp, http, inboxUrl: `http://127.0.0.1:${httpPort}` };
}

/** The messages the sink holds now. */
export async function readInbox(): Promise<SinkMessage[]> {
  const response = await fetch(new URL('/messages', process.env.E2E_SMTP_INBOX_URL));
  return (await response.json()) as SinkMessage[];
}

/** Empties the sink's inbox. */
export async function clearInbox(): Promise<void> {
  await fetch(new URL('/messages', process.env.E2E_SMTP_INBOX_URL), { method: 'DELETE' });
}
