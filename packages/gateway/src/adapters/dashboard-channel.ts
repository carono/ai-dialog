import type { AdapterInput, AgentEvent, EndpointAdapter } from '@ai-dialog/shared';
import type { ProjectConfig } from '../config.js';
import { renderContext } from './context-prompt.js';

const STREAM_WAIT_MS = 20000;

/**
 * Адаптер «наш дашборд» (claude.carono.ru) через BridgeController.
 *
 * Контракт согласован с сессией дашборда (Bearer-auth, CSRF-free, headless-safe):
 *   POST {base}/channel/bridge/message  — create-or-resume по external_id + отправка
 *   GET  {base}/channel/bridge/stream   — long-poll ленты событий до done
 *
 * Мост stateless: всегда шлём external_id = наш sessionId, дашборд держит маппинг
 * external→sess сам, создаёт полноценную channel-сессию, ведёт лог и все фичи.
 */
export class DashboardChannelAdapter implements EndpointAdapter {
  readonly kind = 'dashboard-channel';

  private readonly base: string;
  private readonly secret: string;

  constructor(private readonly project: ProjectConfig) {
    this.base = (process.env.DASHBOARD_BASE_URL || '').replace(/\/$/, '');
    this.secret = process.env.DASHBOARD_SECRET || '';
  }

  async *send(input: AdapterInput): AsyncIterable<AgentEvent> {
    if (!this.base || !this.secret) {
      yield {
        type: 'error',
        message: 'dashboard-channel: задайте DASHBOARD_BASE_URL и DASHBOARD_SECRET в окружении шлюза',
      };
      return;
    }

    const prompt = `${renderContext(input.context)}\n\nВопрос пользователя:\n${input.message}`;

    try {
      // 1. create-or-resume + отправка сообщения
      const started = await this.post('/channel/bridge/message', {
        external_id: input.sessionId,
        project_id: this.project.dashboardProjectId,
        repo_path: this.project.repoPath,
        message: prompt,
      });
      const sessionId = started.session_id as string;
      const conversationId = started.conversation_id as string;
      // Курсор стрима — монотонный id события (after_id), стартуем с 0.
      let afterId = 0;

      // 2. long-poll ленты до done
      while (!input.signal.aborted) {
        const page = await this.get('/channel/bridge/stream', {
          session_id: sessionId,
          conversation_id: conversationId,
          after_id: String(afterId),
          wait_ms: String(STREAM_WAIT_MS),
        });

        const events = Array.isArray(page.events) ? (page.events as StreamEvent[]) : [];
        for (const e of events) {
          const event = mapEvent(e);
          if (event) yield event;
        }
        if (typeof page.last_id === 'number') afterId = page.last_id;

        if (page.done) {
          yield { type: 'done' };
          return;
        }
      }
    } catch (err) {
      if (input.signal.aborted) return;
      yield { type: 'error', message: `dashboard-channel: ${(err as Error).message}` };
    }
  }

  private async post(path: string, body: unknown): Promise<Record<string, unknown>> {
    const res = await fetch(`${this.base}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${this.secret}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
    return (await res.json()) as Record<string, unknown>;
  }

  private async get(path: string, query: Record<string, string>): Promise<Record<string, unknown>> {
    const qs = new URLSearchParams(query).toString();
    const res = await fetch(`${this.base}${path}?${qs}`, {
      headers: { authorization: `Bearer ${this.secret}` },
    });
    if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
    return (await res.json()) as Record<string, unknown>;
  }
}

interface StreamEvent {
  id: number;
  kind: string;
  message?: string;
  data?: { name?: string; input?: unknown };
  ts?: number;
}

/** Маппинг события ленты дашборда (kind) в наше событие адаптера. */
function mapEvent(m: StreamEvent): AgentEvent | null {
  switch (m.kind) {
    case 'text':
      return m.message ? { type: 'text', text: m.message } : null;
    case 'thinking':
      return m.message ? { type: 'thinking', text: m.message } : null;
    case 'tool_use':
      return { type: 'tool_use', name: m.data?.name ?? 'tool', input: m.data?.input };
    case 'tool_result':
      return { type: 'tool_result', ok: true };
    case 'system':
      // системные маркеры дашборда — пропускаем (финал даёт флаг done)
      return null;
    default:
      // user_text (эхо), result, inbox — не транслируем
      return null;
  }
}
