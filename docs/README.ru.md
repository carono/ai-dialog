# ai-dialog

Встраиваемый виджет диалога с AI для любого сайта. При запросе в контекст уходит текущая страница
(URL, маршрут, заголовок, видимый текст, выделение, подсказки о фреймворке, ошибки страницы), а
отвечает AI‑бэкенд с доступом к репозиторию — сам резолвит страницу в файлы исходников.

> 🇬🇧 English documentation: [`../README.md`](../README.md).

## Архитектура

Браузер не может сам запустить Claude Code, поэтому маленький локальный **коннектор** отдаёт его
по WebSocket (это ровно тот inbound‑слой, который описан в официальном гайде Anthropic
[Agent SDK hosting](https://code.claude.com/docs/en/agent-sdk/hosting): твой процесс держит
WS‑порт и вызывает SDK внутри):

```
Виджет (браузер) ──WebSocket──► Коннектор (Node) ──► Claude Code (Agent SDK, cwd = твой репозиторий)
  сбор контекста страницы        auth + контекст→промпт + стриминг
```

Монорепо (pnpm workspaces):

- `packages/widget` — встраиваемый IIFE‑бандл (`widget.js`).
- `packages/gateway` — коннектор: WebSocket‑сервер + адаптер Claude Code.
- `packages/shared` — общий протокол (типы сообщений и интерфейс адаптера).

## Запуск коннектора

У тебя на машине есть Claude Code и репозиторий. Одна команда:

```bash
npx carono-ai-dialog-connector --repo /path/to/your/repo --token a-secret
# → listening on ws://127.0.0.1:8787
```

Из исходников (до публикации): `node packages/gateway/dist/cli.js --repo … --token …`
(сначала `pnpm --filter @ai-dialog/gateway build`).

Опции:

| Флаг | По умолчанию | Назначение |
|---|---|---|
| `--repo <path>` | — (обязателен) | корень репозитория, в котором работает агент (`cwd`) |
| `--token <secret>` | — | общий секрет; виджет обязан прислать тот же `data-token` |
| `--project <id>` | `default` | id проекта, который виджет шлёт в `data-project` |
| `--host <host>` | `127.0.0.1` | адрес привязки |
| `--port <port>` | `8787` | порт |
| `--allow-write` | выкл | разрешить агенту править файлы (по умолчанию — только чтение) |

Аутентификация: коннектор использует уже выполненный на машине вход Claude Code (подписка/OAuth).
Для этого пути **не** задавай `ANTHROPIC_API_KEY` — он перебивает OAuth‑сессию.

## Подключение виджета

Положи бандл на страницу и укажи на коннектор:

```html
<script
  src="https://your-cdn.example/widget.js"
  data-project="default"
  data-gateway="ws://localhost:8787"
  data-token="a-secret"
></script>
```

`data-project` / `data-token` должны совпасть с `--project` / `--token` коннектора. Для удалённого
коннектора терминируй TLS перед ним и используй `wss://`. (Для Yii2 есть отдельный пакет, который
вставляет этот тег из конфига — см. `carono/yii2-ai-dialog`.)

## Продвинутое: несколько проектов и свои бэкенды

Коннектор обслуживает один репозиторий. Для нескольких проектов за одним процессом или бэкенда
помимо Claude Code (свой адаптер) — реестровый gateway и контракт адаптера, см.
[`INTEGRATION.ru.md`](INTEGRATION.ru.md).

## Разработка в монорепо

```bash
pnpm install
pnpm build:shared                 # сначала собрать общие типы
pnpm --filter @ai-dialog/gateway connector:dev -- --repo /path/to/repo --token a-secret
pnpm dev:widget                   # dev-страница с виджетом
```

## Статус MVP

- [x] Контракт протокола (`shared`)
- [x] Коннектор: WebSocket + адаптер Claude Code, один репозиторий через флаги
- [x] Виджет: чат в Shadow DOM, сбор контекста, стриминг, самодиагностика
- [x] Переключение режима в виджете (локальный коннектор / произвольный шлюз)
- [ ] Опубликовать `carono-ai-dialog-connector` (npx)
- [ ] `opencode`-адаптер
- [ ] Аутентификация поверх токена (origin allowlist, rate limit)
- [ ] Индикация tool_result, рендер markdown
