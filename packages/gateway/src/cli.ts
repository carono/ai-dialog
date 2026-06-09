#!/usr/bin/env node
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { WebSocketServer, type WebSocket } from 'ws';
import type { ClientMessage, ServerMessage } from '@ai-dialog/shared';
import { ClaudeCodeAdapter } from './adapters/claude-code.js';
import type { ProjectConfig } from './config.js';

/** Protocol version, kept in sync with @ai-dialog/shared (inlined so the
 *  published connector has no runtime dependency on the workspace package). */
const PROTOCOL_VERSION = 1;

/**
 * Minimal Claude Code connector.
 *
 * The thin inbound layer Anthropic's "Hosting the Agent SDK" guide describes:
 * a WebSocket endpoint that calls the Agent SDK internally with cwd = your repo.
 * One repository, configured by flags — no registry, no extra adapters.
 *
 *   npx @ai-dialog/gateway --repo /path/to/repo --token SECRET
 */

interface Options {
  host: string;
  port: number;
  project: string;
  token?: string;
  repoPath: string;
  allowWrite: boolean;
}

function printHelp(): void {
  console.log(`ai-dialog connector — exposes Claude Code to the widget over WebSocket.

Usage:
  ai-dialog-connector --repo <path> [options]

Options:
  -r, --repo <path>      Repository root the agent works in (cwd). Required.
  -t, --token <secret>   Shared secret; the widget must send the same data-token.
  -p, --project <id>     Project id the widget sends as data-project. Default: "default".
      --host <host>      Bind address. Default: 127.0.0.1.
      --port <port>      Bind port. Default: 8787.
      --allow-write      Allow the agent to edit files (default: read-only).
  -h, --help             Show this help.

The widget then connects with:
  data-gateway="ws://<host>:<port>"  data-project="<project>"  data-token="<token>"`);
}

function parseArgs(argv: string[]): Options {
  const o: Partial<Options> = { host: '127.0.0.1', port: 8787, project: 'default', allowWrite: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = (): string => {
      const v = argv[++i];
      if (v === undefined) {
        console.error(`Error: option ${a} expects a value`);
        process.exit(1);
      }
      return v;
    };
    switch (a) {
      case '-r':
      case '--repo':
        o.repoPath = next();
        break;
      case '-t':
      case '--token':
        o.token = next();
        break;
      case '-p':
      case '--project':
        o.project = next();
        break;
      case '--host':
        o.host = next();
        break;
      case '--port':
        o.port = Number(next());
        break;
      case '--allow-write':
        o.allowWrite = true;
        break;
      case '-h':
      case '--help':
        printHelp();
        process.exit(0);
        break;
      default:
        console.error(`Unknown option: ${a}\n`);
        printHelp();
        process.exit(1);
    }
  }

  if (!o.repoPath) {
    console.error('Error: --repo <path> is required.\n');
    printHelp();
    process.exit(1);
  }
  o.repoPath = resolve(o.repoPath);
  if (!existsSync(o.repoPath)) {
    console.error(`Error: repo path does not exist: ${o.repoPath}`);
    process.exit(1);
  }
  if (!Number.isFinite(o.port)) {
    console.error('Error: --port must be a number.');
    process.exit(1);
  }
  return o as Options;
}

const opts = parseArgs(process.argv.slice(2));

const projectConfig: ProjectConfig = {
  endpoint: 'claude-code',
  repoPath: opts.repoPath,
  token: opts.token,
  allowWrite: opts.allowWrite,
};
const adapter = new ClaudeCodeAdapter(projectConfig);

interface ConnState {
  authed: boolean;
  sessions: Map<string, AbortController>;
}

const httpServer = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, project: opts.project, endpoint: 'claude-code' }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', (ws) => {
  const state: ConnState = { authed: false, sessions: new Map() };

  ws.on('message', (data) => {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(data.toString()) as ClientMessage;
    } catch {
      send(ws, { type: 'error', message: 'Invalid JSON' });
      return;
    }
    handleMessage(ws, state, msg).catch((err) => {
      send(ws, { type: 'error', message: (err as Error).message });
    });
  });

  ws.on('close', () => {
    for (const controller of state.sessions.values()) controller.abort();
    state.sessions.clear();
  });
});

async function handleMessage(ws: WebSocket, state: ConnState, msg: ClientMessage): Promise<void> {
  switch (msg.type) {
    case 'hello': {
      if (msg.protocol !== PROTOCOL_VERSION) {
        send(ws, { type: 'error', message: `Incompatible protocol version (need ${PROTOCOL_VERSION})` });
        return;
      }
      if (msg.project !== opts.project) {
        send(ws, { type: 'error', message: `Unknown project: ${msg.project}` });
        return;
      }
      if (opts.token && opts.token !== msg.token) {
        send(ws, { type: 'error', message: 'Invalid project token' });
        return;
      }
      state.authed = true;
      const sessionId = sanitizeSessionId(msg.sessionId) ?? randomUUID();
      state.sessions.set(sessionId, new AbortController());
      send(ws, { type: 'ready', sessionId, endpoint: 'claude-code' });
      return;
    }

    case 'user_message': {
      if (!state.authed) {
        send(ws, { type: 'error', message: 'Send hello first' });
        return;
      }
      state.sessions.get(msg.sessionId)?.abort();
      const controller = new AbortController();
      state.sessions.set(msg.sessionId, controller);

      try {
        for await (const event of adapter.send({
          sessionId: msg.sessionId,
          message: msg.text,
          context: msg.context,
          signal: controller.signal,
        })) {
          if (controller.signal.aborted) break;
          send(ws, { type: 'event', sessionId: msg.sessionId, event });
        }
      } catch (err) {
        send(ws, {
          type: 'event',
          sessionId: msg.sessionId,
          event: { type: 'error', message: (err as Error).message },
        });
      }
      return;
    }

    case 'abort': {
      state.sessions.get(msg.sessionId)?.abort();
      return;
    }
  }
}

function send(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

/** Accept a client sessionId only if it has a safe shape. */
function sanitizeSessionId(id: string | undefined): string | undefined {
  if (!id) return undefined;
  return /^[A-Za-z0-9_-]{8,128}$/.test(id) ? id : undefined;
}

httpServer.listen(opts.port, opts.host, () => {
  console.log(`[connector] listening on ws://${opts.host}:${opts.port}`);
  console.log(`[connector] project "${opts.project}" → claude-code @ ${opts.repoPath}`);
  console.log(`[connector] write access: ${opts.allowWrite ? 'on' : 'off (read-only)'}`);
});
