# Подключение бэкенда к шлюзу

> 🇬🇧 English version: [`INTEGRATION.md`](INTEGRATION.md).

> **Всего один репозиторий с Claude Code?** Тогда это не нужно — запусти коннектор одной командой
> (`npx carono-ai-dialog-connector --repo … --token …`), см. [Запуск коннектора](README.ru.md#запуск-коннектора).
> Этот документ — **продвинутый** путь: несколько проектов за одним процессом или бэкенд помимо
> Claude Code.

Шлюз (`packages/gateway`) принимает соединения виджетов и для каждого проекта направляет
сообщения в **эндпоинт-адаптер** — код, который собственно «думает» и стримит ответ. Из коробки
есть адаптер `claude-code`: отвечает через Claude Code с доступом к репозиторию проекта.

Этот документ — только про бэкенд и описывает две вещи:

1. [Как подключить Claude Code](#1-подключить-claude-code) к проекту.
2. [Как добавить свою интеграцию](#2-добавить-свою-интеграцию-адаптер) — собственный адаптер.

> Как встроить сам виджет на сайт — отдельная тема (тег `<script>` с `data-*`, либо пакет под
> ваш фреймворк). Здесь этого нет намеренно.

Предполагается, что шлюз уже поднят и отвечает на `/health` — см. быстрый старт в README репозитория.

---

## 1. Подключить Claude Code

Адаптер `claude-code` запускает агента с рабочей директорией = корень репозитория проекта,
подкладывает в промпт контекст страницы (URL, маршрут, видимый текст) и даёт агенту самому
найти нужные файлы и ответить по коду.

### 1.1. Зависимость и доступ к модели

Установите Agent SDK в пакет шлюза:

```bash
pnpm --filter @ai-dialog/gateway add @anthropic-ai/claude-agent-sdk
```

Аутентификация — одно из:

- **Подписка Claude** (рекомендуется для `claude-code`): используется вход Claude Code,
  уже выполненный на машине со шлюзом. В этом случае **не** задавайте `ANTHROPIC_API_KEY` —
  ключ перебивает OAuth-подписку.
- **`ANTHROPIC_API_KEY`** — если работаете по API-ключу.

### 1.2. Завести проект в реестре

В `projects.json` шлюза добавьте запись (ключ — идентификатор проекта):

```json
"myapp": {
  "endpoint": "claude-code",
  "repoPath": "/absolute/path/to/your/repo",
  "token": "a-shared-secret",
  "allowWrite": false
}
```

| Поле | Назначение |
|---|---|
| `endpoint` | `claude-code` |
| `repoPath` | Абсолютный путь к корню репозитория. Станет рабочей директорией агента. Обязателен. |
| `token` | Общий секрет: виджет обязан прислать его. Должен совпасть с `data-token` виджета. |
| `allowWrite` | `false` (по умолчанию) — только чтение (`Read`/`Grep`/`Glob`/`Bash`). `true` — добавляет `Edit`/`Write`. |

Шлюз читает реестр при старте — **перезапустите** его и проверьте, что проект появился:

```bash
curl -s http://<gateway-host>:<port>/health   # {"ok":true,"projects":["myapp", ...]}
```

### 1.3. Связать с виджетом

У виджета `data-project` и `data-token` должны совпасть с ключом и `token` из `projects.json`.
При несовпадении (неизвестный проект, неверный токен) виджет сам покажет, что именно поправить.

> По умолчанию `allowWrite: false` — агент может только читать и объяснять код, но не править
> файлы, чтобы запрос с сайта не менял исходники. Включайте запись осознанно.

---

## 2. Добавить свою интеграцию (адаптер)

Эндпоинт — точка расширения. Чтобы подключить другой бэкенд (свой API, другой агент,
внутренний сервис), реализуйте контракт `EndpointAdapter` и зарегистрируйте его. Виджет и
протокол при этом не меняются — меняется только то, что стоит за шлюзом.

### 2.1. Контракт

Из `@ai-dialog/shared`:

```ts
export interface EndpointAdapter {
  readonly kind: string;
  send(input: AdapterInput): AsyncIterable<AgentEvent>;
}

interface AdapterInput {
  sessionId: string;     // один диалог = одна сессия
  message: string;       // текст пользователя
  context: PageContext;  // контекст страницы: url, маршрут, заголовок, видимый текст, выделение и т.п.
  signal: AbortSignal;   // отмена (разрыв связи / кнопка «Стоп»)
}
```

`send()` стримит события `AgentEvent`, которые шлюз ретранслирует виджету как есть:

| Событие | Когда |
|---|---|
| `{ type: 'text', text }` | прирост текста ответа (delta) |
| `{ type: 'thinking', text }` | блок рассуждений (если есть) |
| `{ type: 'tool_use', name, input? }` | вызов инструмента |
| `{ type: 'tool_result', name?, ok }` | результат инструмента |
| `{ type: 'done' }` | ответ завершён |
| `{ type: 'error', message }` | ошибка |

Правила: всегда завершайте поток `done` (или `error`); уважайте `input.signal` — при отмене
прекращайте генерацию.

### 2.2. Написать адаптер

`packages/gateway/src/adapters/my-endpoint.ts`:

```ts
import type { AdapterInput, AgentEvent, EndpointAdapter } from '@ai-dialog/shared';
import type { ProjectConfig } from '../config.js';

export class MyEndpointAdapter implements EndpointAdapter {
  readonly kind = 'my-endpoint';

  constructor(private readonly project: ProjectConfig) {}

  async *send(input: AdapterInput): AsyncIterable<AgentEvent> {
    try {
      // обратитесь к своему бэкенду, используя input.message и input.context,
      // и стримьте ответ кусками:
      for await (const chunk of callMyBackend(input, this.project)) {
        if (input.signal.aborted) return;
        yield { type: 'text', text: chunk };
      }
      yield { type: 'done' };
    } catch (err) {
      yield { type: 'error', message: (err as Error).message };
    }
  }
}
```

Нужны свои поля в конфиге проекта (например, URL или ключ) — добавьте их в `ProjectConfig`.

### 2.3. Зарегистрировать

- Добавьте свой `kind` в тип `EndpointKind` в `packages/gateway/src/config.ts`.
- Подключите ветку в `build()` (`packages/gateway/src/adapters/index.ts`):

  ```ts
  case 'my-endpoint':
    return new MyEndpointAdapter(config);
  ```

### 2.4. Использовать

В `projects.json` укажите проекту `"endpoint": "my-endpoint"` (плюс ваши поля конфига) и
перезапустите шлюз.

> Готовые адаптеры в `packages/gateway/src/adapters/` можно использовать как образец реализации.
