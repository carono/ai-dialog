import type { AgentEvent } from './adapter.js';
import type { PageContext } from './context.js';

/** Версия протокола виджет ↔ шлюз. Поднимать при несовместимых изменениях. */
export const PROTOCOL_VERSION = 1;

/** Сообщения, которые виджет шлёт шлюзу. */
export type ClientMessage =
  /** Первое сообщение после открытия WS: представление виджета. */
  | {
      type: 'hello';
      protocol: number;
      /** Идентификатор проекта (data-project на скрипте). */
      project: string;
      /** Токен доступа проекта (если включена аутентификация). */
      token?: string;
      /**
       * Сохранённый клиентом sessionId для продолжения диалога.
       * Если задан и валиден — шлюз продолжит ту же сессию (resume),
       * иначе создаст новую. Пусто/нет — новая сессия.
       */
      sessionId?: string;
    }
  /** Сообщение пользователя в диалоге. */
  | {
      type: 'user_message';
      sessionId: string;
      text: string;
      context: PageContext;
    }
  /** Прервать текущий ответ. */
  | { type: 'abort'; sessionId: string };

/** Сообщения, которые шлюз шлёт виджету. */
export type ServerMessage =
  /** Подтверждение hello: сессия создана, можно слать сообщения. */
  | { type: 'ready'; sessionId: string; endpoint: string }
  /** Очередное событие от эндпоинта. */
  | { type: 'event'; sessionId: string; event: AgentEvent }
  /** Протокольная/инфраструктурная ошибка (не от агента). */
  | { type: 'error'; message: string };
