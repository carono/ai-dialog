# ai-dialog

An embeddable AI dialog widget for any website. With each request the current page goes into the
context (URL, route, title, visible text, selection, framework hints, page errors). The endpoint
that answers is **configured per project**:

- **`claude-code`** — a Claude Code session via `@anthropic-ai/claude-agent-sdk` with access to
  the repository. The agent resolves the page route to source files on its own. *(MVP)*
- **`dashboard`** — a direct Claude API call (no coding agent), answers from page content.
- **`opencode`** — stub, integration later.

> 🇷🇺 Документация на русском: [`docs/README.ru.md`](docs/README.ru.md).

## Architecture

```
Widget (Preact, Shadow DOM)  ──WS──►  Gateway (Node, ws)  ──adapter──►  Endpoint
  collects page context               sessions, auth, routing           Claude Code / dashboard / opencode
```

Monorepo (pnpm workspaces):

- `packages/shared` — shared protocol (message types and the adapter interface).
- `packages/gateway` — Node gateway: WebSocket, project registry, endpoint adapters.
- `packages/widget` — embeddable IIFE bundle (`widget.js`).

## Quick start

```bash
# 1. Dependencies
pnpm install

# 2. Environment
cp .env.example .env            # set ANTHROPIC_API_KEY if needed

# 3. Project registry
cp packages/gateway/projects.example.json packages/gateway/projects.json
# edit: endpoint, repoPath (for claude-code), token

# 4. Build shared types (required before dev)
pnpm build:shared

# 5. Run the gateway
pnpm dev:gateway                # ws://127.0.0.1:8787, GET /health

# 6. Widget development (dev harness)
pnpm dev:widget                 # opens a page with the widget connected to the gateway
```

### Build and embed on a real site

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

## Connecting a backend

Connecting a backend to the gateway (Claude Code and your own adapters) is described in
[`docs/INTEGRATION.md`](docs/INTEGRATION.md). In short: add a project entry to the gateway's
`projects.json` + restart the gateway, then embed the widget on the site with a `<script>` tag
and `data-*` attributes (see above).

## Project registry (`packages/gateway/projects.json`)

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

- `token` — if set, the widget must send it (`data-token`).
- `allowWrite` — `false` by default: the agent may only read/search (Read/Grep/Glob/Bash) so a
  request from the site cannot modify sources.

## MVP status

- [x] Protocol contract (`shared`)
- [x] Gateway: WebSocket, project registry, cancellation, reconnect
- [x] Adapters: `claude-code` (Agent SDK), `dashboard` (Claude API)
- [x] Widget: chat in Shadow DOM, context collection, streaming
- [x] Demo site
- [ ] `opencode` adapter
- [ ] Auth on top of the token (origin allowlist, rate limit)
- [ ] Source-map component→file resolution on the widget side
- [ ] `tool_result` indication, markdown rendering
