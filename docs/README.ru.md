# ai-dialog

Встраиваемый виджет диалога с AI для любого сайта. При запросе в контекст уходит
текущая страница (URL, маршрут, заголовок, видимый текст, выделение, подсказки о фреймворке,
ошибки страницы). Конечная точка, которая отвечает, **настраивается на уровне проекта**:

- **`claude-code`** — сессия Claude Code через `@anthropic-ai/claude-agent-sdk` с доступом
  к репозиторию. Агент сам резолвит маршрут страницы в файлы исходников. *(MVP)*
- **`dashboard`** — прямой вызов Claude API (без агента-кодера), отвечает по содержимому страницы.
- **`opencode`** — заглушка, интеграция позже.

> 🇬🇧 English documentation: [`../README.md`](../README.md).

## Архитектура

```
Виджет (Preact, Shadow DOM)  ──WS──►  Шлюз (Node, ws)  ──адаптер──►  Эндпоинт
  сбор контекста страницы              сессии, auth, роутинг          Claude Code / dashboard / opencode
```

Монорепо (pnpm workspaces):

- `packages/shared` — общий протокол (типы сообщений и интерфейс адаптера).
- `packages/gateway` — Node-шлюз: WebSocket, реестр проектов, адаптеры эндпоинтов.
- `packages/widget` — встраиваемый IIFE-бандл (`widget.js`).

## Быстрый старт

```bash
# 1. Зависимости
pnpm install

# 2. Окружение
cp .env.example .env            # при необходимости пропишите ANTHROPIC_API_KEY

# 3. Реестр проектов
cp packages/gateway/projects.example.json packages/gateway/projects.json
# отредактируйте: endpoint, repoPath (для claude-code), token

# 4. Собрать общие типы (нужно перед dev)
pnpm build:shared

# 5. Запустить шлюз
pnpm dev:gateway                # ws://127.0.0.1:8787, GET /health

# 6. Разработка виджета (dev-harness)
pnpm dev:widget                 # откроет страницу с виджетом, подключённым к шлюзу
```

### Сборка и подключение на реальный сайт

```bash
pnpm --filter @ai-dialog/widget build   # → packages/widget/dist/widget.js
```

```html
<script
  src="https://your-cdn.example/widget.js"
  data-project="myapp"
  data-gateway="wss://your-gateway.example"
  data-token="project-secret"
></script>
```

## Подключение бэкенда

Подключение бэкенда к шлюзу (Claude Code и собственные адаптеры) описано в
[`INTEGRATION.ru.md`](INTEGRATION.ru.md). Коротко: добавить запись проекта в `projects.json`
шлюза + перезапустить шлюз, затем подключить виджет на сайте тегом `<script>` с `data-*`
(см. выше).

## Конфиг проектов (`packages/gateway/projects.json`)

```json
{
  "myapp": {
    "endpoint": "claude-code",
    "repoPath": "/absolute/path/to/your/repo",
    "token": "a-secret",
    "allowWrite": false
  }
}
```

- `token` — если задан, виджет обязан прислать его (`data-token`).
- `allowWrite` — по умолчанию `false`: агенту доступны только чтение/поиск
  (Read/Grep/Glob/Bash), чтобы запрос с сайта не правил исходники.

## Статус MVP

- [x] Контракт протокола (`shared`)
- [x] Шлюз: WebSocket, реестр проектов, отмена, реконнект
- [x] Адаптеры: `claude-code` (Agent SDK), `dashboard` (Claude API)
- [x] Виджет: чат в Shadow DOM, сбор контекста, стриминг
- [x] Демо-сайт
- [ ] `opencode`-адаптер
- [ ] Аутентификация поверх токена (origin allowlist, rate limit)
- [ ] Source-map резолв компонент→файл на стороне виджета
- [ ] Индикация tool_result, рендер markdown
