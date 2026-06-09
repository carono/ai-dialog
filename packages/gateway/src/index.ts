import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { WebSocketServer, type WebSocket } from 'ws';
import {
  PROTOCOL_VERSION,
  type ClientMessage,
  type ServerMessage,
} from '@ai-dialog/shared';
import { loadConfig, type GatewayConfig } from './config.js';
import { getAdapter } from './adapters/index.js';

const config = loadConfig();

/** State of a single WS connection. */
interface ConnState {
  project?: string;
  authed: boolean;
  /** Active sessions: sessionId -> abort controller for the current response. */
  sessions: Map<string, AbortController>;
}

const http = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, projects: Object.keys(config.projects) }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server: http });

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
    handleMessage(ws, state, msg, config).catch((err) => {
      send(ws, { type: 'error', message: (err as Error).message });
    });
  });

  ws.on('close', () => {
    for (const controller of state.sessions.values()) controller.abort();
    state.sessions.clear();
  });
});

async function handleMessage(
  ws: WebSocket,
  state: ConnState,
  msg: ClientMessage,
  cfg: GatewayConfig,
): Promise<void> {
  switch (msg.type) {
    case 'hello': {
      if (msg.protocol !== PROTOCOL_VERSION) {
        send(ws, { type: 'error', message: `Incompatible protocol version (need ${PROTOCOL_VERSION})` });
        return;
      }
      const project = cfg.projects[msg.project];
      if (!project) {
        send(ws, { type: 'error', message: `Unknown project: ${msg.project}` });
        return;
      }
      if (project.token && project.token !== msg.token) {
        send(ws, { type: 'error', message: 'Invalid project token' });
        return;
      }
      state.project = msg.project;
      state.authed = true;
      // Resume the client-saved session if a valid sessionId was sent;
      // otherwise create a new one. This lets the dialog survive a page change and connection drop.
      const sessionId = sanitizeSessionId(msg.sessionId) ?? randomUUID();
      state.sessions.set(sessionId, new AbortController());
      send(ws, { type: 'ready', sessionId, endpoint: project.endpoint });
      return;
    }

    case 'user_message': {
      if (!state.authed || !state.project) {
        send(ws, { type: 'error', message: 'Send hello first' });
        return;
      }
      const project = cfg.projects[state.project];
      if (!project) {
        send(ws, { type: 'error', message: 'Project is no longer available' });
        return;
      }

      // Fresh controller for each response (abort the old one).
      state.sessions.get(msg.sessionId)?.abort();
      const controller = new AbortController();
      state.sessions.set(msg.sessionId, controller);

      const adapter = getAdapter(state.project, project);
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

/** Accepts the client sessionId only if it has a safe form. */
function sanitizeSessionId(id: string | undefined): string | undefined {
  if (!id) return undefined;
  return /^[A-Za-z0-9_-]{8,128}$/.test(id) ? id : undefined;
}

http.listen(config.port, config.host, () => {
  console.log(`[gateway] listening on ws://${config.host}:${config.port}`);
  console.log(`[gateway] projects: ${Object.keys(config.projects).join(', ') || '(none)'}`);
});
