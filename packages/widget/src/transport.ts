import {
  PROTOCOL_VERSION,
  type AgentEvent,
  type ClientMessage,
  type PageContext,
  type ServerMessage,
} from '@ai-dialog/shared';

export type TransportStatus = 'connecting' | 'ready' | 'closed' | 'error';

export interface TransportHandlers {
  onStatus(status: TransportStatus, detail?: string): void;
  onEvent(event: AgentEvent): void;
}

/** Widget WS client: connection to the gateway, hello handshake, event stream. */
export class Transport {
  private ws?: WebSocket;
  private sessionId?: string;
  private reconnectTimer?: number;
  /** Timer waiting for the socket to open: a stuck connect → «Gateway unavailable». */
  private connectTimer?: number;
  private closedByUser = false;
  /** Whether the handshake completed (`ready` received). Before that, server errors are configuration errors. */
  private ready = false;
  private readonly sidKey: string;

  constructor(
    private readonly gateway: string,
    private readonly project: string,
    private readonly token: string | undefined,
    private readonly handlers: TransportHandlers,
  ) {
    this.sidKey = `aidlg.sid.${project}`;
    this.sessionId = readStored(this.sidKey);
  }

  connect(): void {
    this.closedByUser = false;
    this.ready = false;
    this.handlers.onStatus('connecting');
    const ws = new WebSocket(this.gateway);
    this.ws = ws;

    // If the socket didn't open within the allotted time, don't hang in «connecting»,
    // but report an error (diagnostics will show the connector isn't running).
    this.connectTimer = window.setTimeout(() => {
      if (ws.readyState !== WebSocket.OPEN) {
        this.handlers.onStatus('error', `couldn't open WebSocket to ${this.gateway}`);
        try {
          ws.close();
        } catch {
          /* noop */
        }
      }
    }, 8000);

    ws.addEventListener('open', () => {
      if (this.connectTimer) clearTimeout(this.connectTimer);
      this.sendRaw({
        type: 'hello',
        protocol: PROTOCOL_VERSION,
        project: this.project,
        token: this.token,
        // Reuse the stored sessionId — continue the conversation.
        sessionId: this.sessionId,
      });
    });

    ws.addEventListener('message', (e) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(e.data as string) as ServerMessage;
      } catch {
        return;
      }
      this.handleServerMessage(msg);
    });

    ws.addEventListener('close', (e) => {
      if (this.connectTimer) clearTimeout(this.connectTimer);
      const detail = `closed (code ${e.code}${e.reason ? `: ${e.reason}` : ''})`;
      this.handlers.onStatus('closed', detail);
      if (!this.closedByUser) this.scheduleReconnect();
    });

    ws.addEventListener('error', () => {
      if (this.connectTimer) clearTimeout(this.connectTimer);
      this.handlers.onStatus('error', `couldn't open WebSocket to ${this.gateway}`);
    });
  }

  /** Sends the user's message together with a context snapshot. */
  sendMessage(text: string, context: PageContext): boolean {
    if (!this.sessionId || this.ws?.readyState !== WebSocket.OPEN) return false;
    this.sendRaw({ type: 'user_message', sessionId: this.sessionId, text, context });
    return true;
  }

  /** Aborts the current response. */
  abort(): void {
    if (this.sessionId && this.ws?.readyState === WebSocket.OPEN) {
      this.sendRaw({ type: 'abort', sessionId: this.sessionId });
    }
  }

  close(): void {
    this.closedByUser = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.connectTimer) clearTimeout(this.connectTimer);
    this.ws?.close();
  }

  /** Manual reconnect (the «Check again» button in diagnostics). */
  retry(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.connectTimer) clearTimeout(this.connectTimer);
    try {
      this.ws?.close();
    } catch {
      /* noop */
    }
    this.connect();
  }

  /** Start a new session: forget the stored sessionId and request a new one. */
  reset(): void {
    this.sessionId = undefined;
    removeStored(this.sidKey);
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.sendRaw({
        type: 'hello',
        protocol: PROTOCOL_VERSION,
        project: this.project,
        token: this.token,
      });
    } else {
      this.connect();
    }
  }

  private handleServerMessage(msg: ServerMessage): void {
    switch (msg.type) {
      case 'ready':
        this.ready = true;
        this.sessionId = msg.sessionId;
        writeStored(this.sidKey, msg.sessionId);
        this.handlers.onStatus('ready', msg.endpoint);
        break;
      case 'event':
        this.handlers.onEvent(msg.event);
        break;
      case 'error':
        // Before the handshake, a server error (unknown project, invalid token,
        // protocol version) is a configuration problem: show it in diagnostics
        // instead of losing it in an empty dialog. After ready, it's an agent response error.
        if (this.ready) {
          this.handlers.onEvent({ type: 'error', message: msg.message });
        } else {
          this.handlers.onStatus('error', msg.message);
        }
        break;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = window.setTimeout(() => this.connect(), 2000);
  }

  private sendRaw(msg: ClientMessage): void {
    this.ws?.send(JSON.stringify(msg));
  }
}

// --- localStorage guarded against unavailability (private mode, etc.) ---

function readStored(key: string): string | undefined {
  try {
    return localStorage.getItem(key) || undefined;
  } catch {
    return undefined;
  }
}

function writeStored(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* noop */
  }
}

function removeStored(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* noop */
  }
}
