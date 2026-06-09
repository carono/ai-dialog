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

/** WS-клиент виджета: соединение со шлюзом, hello-рукопожатие, стрим событий. */
export class Transport {
  private ws?: WebSocket;
  private sessionId?: string;
  private reconnectTimer?: number;
  private closedByUser = false;
  /** Прошло ли рукопожатие (получен `ready`). До этого серверные ошибки — настроечные. */
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

    ws.addEventListener('open', () => {
      this.sendRaw({
        type: 'hello',
        protocol: PROTOCOL_VERSION,
        project: this.project,
        token: this.token,
        // Переиспользуем сохранённый sessionId — продолжаем диалог.
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
      const detail = `закрыто (код ${e.code}${e.reason ? `: ${e.reason}` : ''})`;
      this.handlers.onStatus('closed', detail);
      if (!this.closedByUser) this.scheduleReconnect();
    });

    ws.addEventListener('error', () => {
      this.handlers.onStatus('error', `не удалось открыть WS к ${this.gateway}`);
    });
  }

  /** Отправляет сообщение пользователя со снимком контекста. */
  sendMessage(text: string, context: PageContext): boolean {
    if (!this.sessionId || this.ws?.readyState !== WebSocket.OPEN) return false;
    this.sendRaw({ type: 'user_message', sessionId: this.sessionId, text, context });
    return true;
  }

  /** Прерывает текущий ответ. */
  abort(): void {
    if (this.sessionId && this.ws?.readyState === WebSocket.OPEN) {
      this.sendRaw({ type: 'abort', sessionId: this.sessionId });
    }
  }

  close(): void {
    this.closedByUser = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
  }

  /** Ручная переподключка (кнопка «Проверить снова» в диагностике). */
  retry(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    try {
      this.ws?.close();
    } catch {
      /* noop */
    }
    this.connect();
  }

  /** Начать новую сессию: забыть сохранённый sessionId и запросить новый. */
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
        // До рукопожатия серверная ошибка (неизвестный проект, неверный токен,
        // версия протокола) — это проблема настройки: показываем в диагностике,
        // а не теряем в пустом диалоге. После ready — это ошибка ответа агента.
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

// --- localStorage с защитой от недоступности (приватный режим и т.п.) ---

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
