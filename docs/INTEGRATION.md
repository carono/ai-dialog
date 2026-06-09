# Connecting a backend to the gateway

> 🇷🇺 Версия на русском: [`INTEGRATION.ru.md`](INTEGRATION.ru.md).

> **Just one repository with Claude Code?** You don't need any of this — run the connector with a
> single command (`npx carono-ai-dialog-connector --repo … --token …`), see [Run the connector](../README.md#run-the-connector).
> This document is the **advanced** path: serving several projects from one process, or plugging in
> a backend other than Claude Code.

The gateway (`packages/gateway`) accepts widget connections and, for each project, routes messages
to an **endpoint adapter** — the code that actually "thinks" and streams the answer. Out of the box
there is the `claude-code` adapter: it answers via Claude Code with access to the project's
repository.

This document is only about the backend and covers two things:

1. [How to connect Claude Code](#1-connect-claude-code) to a project.
2. [How to add your own integration](#2-add-your-own-integration-an-adapter) — a custom adapter.

> How to embed the widget itself on a site is a separate topic (a `<script>` tag with `data-*`, or
> a package for your framework). It is intentionally out of scope here.

It is assumed the gateway is already up and answering `/health` — see the quick start in the
repository README.

---

## 1. Connect Claude Code

The `claude-code` adapter runs an agent with its working directory = the project's repository root,
injects the page context (URL, route, visible text) into the prompt, and lets the agent find the
relevant files and answer from the code.

### 1.1. Dependency and model access

Install the Agent SDK into the gateway package:

```bash
pnpm --filter @ai-dialog/gateway add @anthropic-ai/claude-agent-sdk
```

Authentication — one of:

- **Claude subscription** (recommended for `claude-code`): uses the Claude Code login already
  performed on the gateway machine. In this case do **not** set `ANTHROPIC_API_KEY` — the key
  overrides the OAuth subscription.
- **`ANTHROPIC_API_KEY`** — if you work with an API key.

### 1.2. Register the project

Add an entry to the gateway's `projects.json` (the key is the project identifier):

```json
"myapp": {
  "endpoint": "claude-code",
  "repoPath": "/absolute/path/to/your/repo",
  "token": "a-shared-secret",
  "allowWrite": false
}
```

| Field | Purpose |
|---|---|
| `endpoint` | `claude-code` |
| `repoPath` | Absolute path to the repository root. Becomes the agent's working directory. Required. |
| `token` | Shared secret: the widget must send it. Must match the widget's `data-token`. |
| `allowWrite` | `false` (default) — read-only (`Read`/`Grep`/`Glob`/`Bash`). `true` — also adds `Edit`/`Write`. |

The gateway reads the registry at startup — **restart** it and check the project appears:

```bash
curl -s http://<gateway-host>:<port>/health   # {"ok":true,"projects":["myapp", ...]}
```

### 1.3. Match the widget

The widget's `data-project` and `data-token` must match the key and `token` in `projects.json`.
On a mismatch (unknown project, wrong token) the widget itself shows what to fix.

> By default `allowWrite: false` — the agent can only read and explain code, not edit files, so a
> request from the site cannot change sources. Enable writes deliberately.

---

## 2. Add your own integration (an adapter)

The endpoint is an extension point. To plug in another backend (your own API, a different agent, an
internal service), implement the `EndpointAdapter` contract and register it. The widget and the
protocol stay the same — only what sits behind the gateway changes.

### 2.1. The contract

From `@ai-dialog/shared`:

```ts
export interface EndpointAdapter {
  readonly kind: string;
  send(input: AdapterInput): AsyncIterable<AgentEvent>;
}

interface AdapterInput {
  sessionId: string;     // one dialog = one session
  message: string;       // user text
  context: PageContext;  // page context: url, route, title, visible text, selection, etc.
  signal: AbortSignal;   // cancellation (disconnect / "Stop" button)
}
```

`send()` streams `AgentEvent`s, which the gateway relays to the widget as-is:

| Event | When |
|---|---|
| `{ type: 'text', text }` | answer text delta |
| `{ type: 'thinking', text }` | reasoning block (if any) |
| `{ type: 'tool_use', name, input? }` | tool call |
| `{ type: 'tool_result', name?, ok }` | tool result |
| `{ type: 'done' }` | answer finished |
| `{ type: 'error', message }` | error |

Rules: always end the stream with `done` (or `error`); honor `input.signal` — stop generating on
cancellation.

### 2.2. Write the adapter

`packages/gateway/src/adapters/my-endpoint.ts`:

```ts
import type { AdapterInput, AgentEvent, EndpointAdapter } from '@ai-dialog/shared';
import type { ProjectConfig } from '../config.js';

export class MyEndpointAdapter implements EndpointAdapter {
  readonly kind = 'my-endpoint';

  constructor(private readonly project: ProjectConfig) {}

  async *send(input: AdapterInput): AsyncIterable<AgentEvent> {
    try {
      // call your backend using input.message and input.context,
      // and stream the answer in chunks:
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

Need your own fields in the project config (a URL or key, say) — add them to `ProjectConfig`.

### 2.3. Register it

- Add your `kind` to the `EndpointKind` type in `packages/gateway/src/config.ts`.
- Wire a branch into `build()` (`packages/gateway/src/adapters/index.ts`):

  ```ts
  case 'my-endpoint':
    return new MyEndpointAdapter(config);
  ```

### 2.4. Use it

In `projects.json` set the project's `"endpoint": "my-endpoint"` (plus your config fields) and
restart the gateway.

> The existing adapters in `packages/gateway/src/adapters/` can serve as a reference implementation.
