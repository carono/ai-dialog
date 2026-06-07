import type { PageContext } from './context.js';

/**
 * Единое событие, которое любой эндпоинт-адаптер стримит наружу.
 * Шлюз ретранслирует эти события виджету как есть.
 */
export type AgentEvent =
  /** Прирост текста ответа (delta). */
  | { type: 'text'; text: string }
  /** Видимый блок рассуждений (если эндпоинт их отдаёт). */
  | { type: 'thinking'; text: string }
  /** Агент вызвал инструмент (read/grep/bash/edit и т.п.). */
  | { type: 'tool_use'; name: string; input?: unknown }
  /** Результат инструмента (опционально, для индикации в UI). */
  | { type: 'tool_result'; name?: string; ok: boolean }
  /** Ответ завершён нормально. */
  | { type: 'done' }
  /** Ошибка в ходе выполнения. */
  | { type: 'error'; message: string };

export interface AdapterInput {
  /** Идентификатор сессии (один диалог = одна сессия). */
  sessionId: string;
  /** Текст сообщения пользователя. */
  message: string;
  /** Контекст страницы на момент отправки. */
  context: PageContext;
  /** Сигнал отмены — шлюз дёргает abort при разрыве/команде stop. */
  signal: AbortSignal;
}

/**
 * Контракт адаптера эндпоинта. Реализации: Claude Code (Agent SDK),
 * opencode (HTTP), наш дашборд (Claude API напрямую).
 */
export interface EndpointAdapter {
  /** Человекочитаемое имя для логов. */
  readonly kind: string;
  /** Стримит события ответа на одно сообщение пользователя. */
  send(input: AdapterInput): AsyncIterable<AgentEvent>;
}
