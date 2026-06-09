# ai-dialog

An embeddable AI dialog widget for any website. With each request the current page goes into the
context (URL, route, title, visible text, selection, framework hints, page errors), and an AI
backend with access to your repository answers — resolving the page to source files on its own.

> 🇷🇺 Документация на русском: [`docs/README.ru.md`](docs/README.ru.md).

## Architecture

A browser can't run Claude Code itself, so a small local **connector** exposes it over WebSocket
(this is exactly the inbound layer Anthropic's [Agent SDK hosting guide](https://code.claude.com/docs/en/agent-sdk/hosting)
describes — your process holds the WS port and calls the SDK internally):

```
Widget (browser) ──WebSocket──► Connector (Node) ──► Claude Code (Agent SDK, cwd = your repo)
  collects page context          auth + page-context→prompt + streaming
```

Monorepo (pnpm workspaces):

- `packages/widget` — embeddable IIFE bundle (`widget.js`).
- `packages/gateway` — the connector: WebSocket server + Claude Code adapter.
- `packages/shared` — shared protocol (message types and the adapter interface).

## Run the connector

You have Claude Code on the machine with your repo. Run one command:

```bash
npx carono-ai-dialog-connector --repo /path/to/your/repo --token a-secret
# → listening on ws://127.0.0.1:8787
```

From source (before publishing): `node packages/gateway/dist/cli.js --repo … --token …`
(run `pnpm --filter @ai-dialog/gateway build` first).

Options:

| Flag | Default | Meaning |
|---|---|---|
| `--repo <path>` | — (required) | repository root the agent works in (`cwd`) |
| `--token <secret>` | — | shared secret; the widget must send the same `data-token` |
| `--project <id>` | `default` | project id the widget sends as `data-project` |
| `--host <host>` | `127.0.0.1` | bind address |
| `--port <port>` | `8787` | bind port |
| `--allow-write` | off | allow the agent to edit files (default: read-only) |

Auth: the connector uses the Claude login already on the machine (subscription/OAuth). Don't set
`ANTHROPIC_API_KEY` for that path — it overrides the OAuth session.

## Embed the widget

Put the bundle on the page and point it at the connector:

```html
<script
  src="https://your-cdn.example/widget.js"
  data-project="default"
  data-gateway="ws://localhost:8787"
  data-token="a-secret"
></script>
```

`data-project` / `data-token` must match the connector's `--project` / `--token`. For a remote
connector, terminate TLS in front of it and use `wss://`. (For Yii2 there's a dedicated package
that injects this tag from config; see `carono/yii2-ai-dialog`.)

## Advanced: multiple projects & custom backends

The connector serves one repo. For multiple projects behind one process, or a backend other than
Claude Code (your own adapter), use the registry-based gateway and the adapter contract — see
[`docs/INTEGRATION.md`](docs/INTEGRATION.md).

## Monorepo development

```bash
pnpm install
pnpm build:shared                 # build shared types first
pnpm --filter @ai-dialog/gateway connector:dev -- --repo /path/to/repo --token a-secret
pnpm dev:widget                   # dev harness page with the widget
```

## MVP status

- [x] Protocol contract (`shared`)
- [x] Connector: WebSocket + Claude Code adapter, single repo via flags
- [x] Widget: chat in Shadow DOM, context collection, streaming, self-onboarding diagnostics
- [x] Mode switch in the widget (local connector / custom gateway)
- [ ] Publish `carono-ai-dialog-connector` (npx)
- [ ] `opencode` adapter
- [ ] Auth on top of the token (origin allowlist, rate limit)
- [ ] `tool_result` indication, markdown rendering
