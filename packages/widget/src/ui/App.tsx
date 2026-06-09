import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import type { AgentEvent, SelectedElement } from '@ai-dialog/shared';
import { collectContext } from '../context';
import { startPicker } from '../picker';
import { Transport, type TransportStatus } from '../transport';

interface Msg {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  tools: string[];
  error?: boolean;
}

interface Props {
  project: string;
  gateway: string;
  token?: string;
}

const HISTORY_LIMIT = 50;
let nextId = 1;

/** Default port of the local connector (matches the connector's default). */
const DEFAULT_PORT = 8787;
/** Local gateway URL for claude-code mode on the given port. */
const localGatewayUrl = (port: number): string => `ws://${location.hostname}:${port}`;
const CONN_KEY = 'aidlg.conn';

/** Connection mode, chosen in the UI and saved to localStorage. */
interface Conn {
  /** `claude-code` — local gateway; `custom` — arbitrary address/project/token. */
  mode: 'claude-code' | 'custom';
  gateway: string;
  /** Local connector port (claude-code mode). */
  port: number;
  project: string;
  token: string;
  /**
   * Signature of the page's data-* this choice was saved against. When the page
   * config changes, the saved override is dropped and data-* are picked up again.
   */
  src?: string;
}

export function App({ project, gateway, token }: Props) {
  const [conn, setConn] = useState<Conn>(() => loadConn({ project, gateway, token }));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const eff = effectiveConn(conn, { project, token });

  const histKey = `aidlg.hist.${eff.project}`;
  const pinnedKey = `aidlg.pinned.${eff.project}`;
  const [pinned, setPinned] = useState(() => loadFlag(pinnedKey));
  // If pinned, the panel is open right away on page load.
  const [open, setOpen] = useState(() => loadFlag(pinnedKey));
  const [status, setStatus] = useState<TransportStatus>('connecting');
  const [endpoint, setEndpoint] = useState('');
  const [diag, setDiag] = useState('');
  const [messages, setMessages] = useState<Msg[]>(() => {
    const loaded = loadHistory(histKey);
    for (const m of loaded) if (m.id >= nextId) nextId = m.id + 1;
    return loaded;
  });
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [selectedEl, setSelectedEl] = useState<SelectedElement | null>(null);
  const [picking, setPicking] = useState(false);

  const transportRef = useRef<Transport>();
  const bodyRef = useRef<HTMLDivElement>(null);
  const pickerStop = useRef<(() => void) | null>(null);

  // Current assistant message that events are streamed into.
  const activeId = useRef<number | null>(null);

  const handleEvent = useCallback((event: AgentEvent) => {
    const id = activeId.current;
    if (id == null) return;
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== id) return m;
        switch (event.type) {
          case 'text':
            return { ...m, text: m.text + event.text };
          case 'tool_use':
            return { ...m, tools: [...m.tools, event.name] };
          case 'error':
            return { ...m, text: m.text || event.message, error: true };
          default:
            return m;
        }
      }),
    );
    if (event.type === 'done' || event.type === 'error') {
      setBusy(false);
      activeId.current = null;
    }
  }, []);

  useEffect(() => {
    const t = new Transport(eff.gateway, eff.project, eff.token, {
      onStatus: (s, detail) => {
        setStatus(s);
        if (s === 'ready') {
          setEndpoint(detail || '');
          setDiag('');
        } else {
          setDiag(detail || '');
        }
      },
      onEvent: handleEvent,
    });
    t.connect();
    transportRef.current = t;
    return () => t.close();
  }, [eff.gateway, eff.project, eff.token, handleEvent]);

  // Apply new connection parameters: stamp the page signature, overwrite storage,
  // reconnect, and show the history of the selected project.
  const applyConn = useCallback(
    (next: Conn) => {
      const stamped: Conn = { ...next, src: connSig({ project, gateway, token }) };
      const effProject = effectiveConn(stamped, { project, token }).project;
      saveConn(stamped);
      setConn(stamped);
      setSettingsOpen(false);
      activeId.current = null;
      setBusy(false);
      setMessages(loadHistory(`aidlg.hist.${effProject}`));
    },
    [project, gateway, token],
  );

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [messages, open]);

  // Persist the dialog to localStorage — survives page changes and reloads.
  useEffect(() => {
    saveHistory(histKey, messages);
  }, [histKey, messages]);

  // Start the inspector: collapse the panel, highlight elements, click locks one in.
  const startPick = useCallback(() => {
    pickerStop.current?.();
    setOpen(false);
    setPicking(true);
    const host = document.getElementById('ai-dialog-host') ?? document.body;
    pickerStop.current = startPicker(
      host,
      (el) => {
        setSelectedEl(el);
        setPicking(false);
        setOpen(true);
        pickerStop.current = null;
      },
      () => {
        setPicking(false);
        setOpen(true);
        pickerStop.current = null;
      },
    );
  }, []);

  useEffect(() => () => pickerStop.current?.(), []);

  const send = useCallback(() => {
    const text = input.trim();
    if (!text || busy) return;
    const ctx = collectContext();
    if (selectedEl) ctx.selectedElement = selectedEl;
    const ok = transportRef.current?.sendMessage(text, ctx);
    if (!ok) return;

    const userMsg: Msg = { id: nextId++, role: 'user', text, tools: [] };
    const assistantMsg: Msg = { id: nextId++, role: 'assistant', text: '', tools: [] };
    activeId.current = assistantMsg.id;
    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput('');
    setBusy(true);
  }, [input, busy, selectedEl]);

  const stop = useCallback(() => {
    transportRef.current?.abort();
    setBusy(false);
    activeId.current = null;
  }, []);

  // Pin the window: stay open after a page reload.
  const togglePin = useCallback(() => {
    setPinned((p) => {
      const v = !p;
      saveFlag(pinnedKey, v);
      return v;
    });
  }, [pinnedKey]);

  // Clear: new session on the gateway + clean dialog and history.
  const clear = useCallback(() => {
    transportRef.current?.reset();
    activeId.current = null;
    setBusy(false);
    setMessages([]);
    removeHistory(histKey);
  }, [histKey]);

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const wsHost = (() => {
    try {
      return new URL(eff.gateway).host;
    } catch {
      return eff.gateway;
    }
  })();
  const statusText =
    status === 'ready'
      ? 'connected'
      : status === 'connecting'
        ? 'connecting…'
        : status === 'closed'
          ? 'connection closed'
          : 'connection error';

  return (
    <>
      {open && (
        <div class="panel">
          <div class="header">
            <span class={`dot ${status === 'ready' ? 'ready' : ''}`} />
            <span class="title">AI dialog</span>
            {endpoint && <span class="endpoint">{endpoint}</span>}
            <button
              class={`gear ${settingsOpen ? 'on' : ''}`}
              onClick={() => setSettingsOpen((v) => !v)}
              title="Connection settings"
            >
              ⚙
            </button>
            <button
              class={`pin ${pinned ? 'on' : ''}`}
              onClick={togglePin}
              title={pinned ? 'Pinned: opens on page load' : 'Pin the window open'}
            >
              📌
            </button>
            {messages.length > 0 && (
              <button class="clear" onClick={clear} title="Start a new dialog">
                Clear
              </button>
            )}
            <button class="close" onClick={() => setOpen(false)} aria-label="Close">
              ×
            </button>
          </div>

          {settingsOpen ? (
            <Settings
              conn={conn}
              page={{ project, gateway, token }}
              onApply={applyConn}
              onClose={() => setSettingsOpen(false)}
            />
          ) : status !== 'ready' ? (
            // No connection — show only diagnostics, hide the chat window.
            <Diagnostics
              reason={classifyDiag(status, diag)}
              statusText={statusText}
              gateway={eff.gateway}
              wsHost={wsHost}
              project={eff.project}
              token={eff.token}
              detail={diag}
              onRetry={() => transportRef.current?.retry()}
              onSettings={() => setSettingsOpen(true)}
            />
          ) : (
            <>
              <div class="body" ref={bodyRef}>
                {messages.length === 0 ? (
                  <div class="empty">
                    Ask anything about the current page. The context (URL, route, visible text) is
                    sent along with your question.
                  </div>
                ) : (
                  messages.map((m) => (
                    <div key={m.id} class={`msg ${m.role}`}>
                      <div>
                        <div class={`bubble ${m.error ? 'error' : ''}`}>
                          {m.text || (m.role === 'assistant' && busy ? '…' : '')}
                        </div>
                        {m.tools.length > 0 && (
                          <div class="tools">
                            {m.tools.map((t, i) => (
                              <span key={i} class="tool">
                                {t}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>

              {selectedEl && (
                <div class="picked">
                  <span class="picked-sel" title={selectedEl.selector}>
                    🎯 {selectedEl.selector}
                  </span>
                  <button
                    class="picked-x"
                    onClick={() => setSelectedEl(null)}
                    title="Remove element"
                  >
                    ✕
                  </button>
                </div>
              )}

              <div class="footer">
                <button class="pick" onClick={startPick} title="Pick an element on the page">
                  ⌖
                </button>
                <textarea
                  rows={1}
                  placeholder="Your question…"
                  value={input}
                  onInput={(e) => setInput((e.target as HTMLTextAreaElement).value)}
                  onKeyDown={onKeyDown}
                />
                {busy ? (
                  <button class="stop" onClick={stop}>
                    Stop
                  </button>
                ) : (
                  <button onClick={send} disabled={!input.trim()}>
                    ➤
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {picking && (
        <div class="pick-hint">Click an element on the page · Esc to cancel</div>
      )}

      <button class="launcher" onClick={() => setOpen((v) => !v)} aria-label="AI dialog">
        {open ? '×' : '💬'}
      </button>
    </>
  );
}

// --- Diagnostics and self-configuration ---

/** Full guide for deploying the gateway and connecting (for a human and an AI agent). */
const DOCS_URL = 'https://github.com/carono/ai-dialog/blob/master/docs/INTEGRATION.md';

type DiagReason = 'connecting' | 'no-gateway' | 'unknown-project' | 'bad-token' | 'protocol' | 'other';

/** Determines the reason from the transport status and the server error text. */
function classifyDiag(status: TransportStatus, diag: string): DiagReason {
  const d = diag.toLowerCase();
  if (d.includes('unknown project')) return 'unknown-project';
  if (d.includes('token')) return 'bad-token';
  if (d.includes('protocol')) return 'protocol';
  if (status === 'connecting') return 'connecting';
  // WebSocket-level failures (open failed / connection closed) → gateway unreachable.
  if (status === 'closed' || d.includes('websocket')) return 'no-gateway';
  if (diag) return 'other';
  return 'no-gateway';
}

interface DiagProps {
  reason: DiagReason;
  statusText: string;
  gateway: string;
  wsHost: string;
  project: string;
  token?: string;
  detail: string;
  onRetry: () => void;
  onSettings: () => void;
}

/** The "what's wrong and how to fix it" block — the widget's main onboarding screen. */
function Diagnostics({ reason, statusText, gateway, wsHost, project, token, detail, onRetry, onSettings }: DiagProps) {
  const tokenVal = token && token.length ? token : 'CHOOSE-A-SECRET';
  const health = 'curl -s http://127.0.0.1:8787/health';
  const projectsJson =
    `"${project}": {\n` +
    '  "endpoint": "claude-code",\n' +
    '  "repoPath": "/absolute/path/to/your/repo",\n' +
    `  "token": "${tokenVal}",\n` +
    '  "allowWrite": false\n' +
    '}';
  const scriptTag =
    '<script src=".../widget.js"\n' +
    `  data-project="${project}"\n` +
    `  data-gateway="${gateway}"\n` +
    `  data-token="${tokenVal}"></script>`;
  // Ready-to-run command that starts the local Claude Code connector matching this widget.
  const port = (() => {
    try {
      const p = new URL(gateway).port;
      return p ? Number(p) : DEFAULT_PORT;
    } catch {
      return DEFAULT_PORT;
    }
  })();
  const startCmd =
    'npx carono-ai-dialog-connector --repo /path/to/your/repo' +
    ` --project ${project}` +
    (token ? ` --token ${token}` : '') +
    (port !== DEFAULT_PORT ? ` --port ${port}` : '');

  const title =
    reason === 'connecting'
      ? 'Connecting to the gateway…'
      : reason === 'unknown-project'
        ? "Project isn't registered on the gateway"
        : reason === 'bad-token'
          ? token
            ? 'Invalid project token'
            : 'No project token set'
          : reason === 'protocol'
            ? 'Widget and gateway versions differ'
            : reason === 'other'
              ? "Couldn't connect"
              : 'Gateway unavailable';

  return (
    <div class="diag">
      <div class="diag-title">{title}</div>

      {reason === 'connecting' && (
        <>
          <p>
            Opening a WebSocket connection to <code>{wsHost}</code>. If it hangs, the connector
            probably isn't running — start it (copy &amp; run):
          </p>
          <Copyable code={startCmd} />
          <p class="diag-note">
            Replace the repo path with yours. It listens on <code>{wsHost}</code> and the widget
            connects automatically.
          </p>
        </>
      )}

      {reason === 'no-gateway' && (
        <>
          <p>
            The widget needs a running <b>connector</b> to answer. If you have Claude Code on the
            machine with your repo, start it (copy &amp; run):
          </p>
          <Copyable code={startCmd} />
          <p class="diag-note">
            Replace the repo path with yours. It listens on <code>{wsHost}</code> and the widget
            reconnects automatically.
          </p>
          <p>
            Using a <b>remote gateway</b> instead? Make sure it is up and proxied: it should answer{' '}
            <code>{'{"ok":true,…}'}</code> on <code>/health</code>, and <code>{wsHost}</code> must be
            proxied with a WebSocket upgrade (<code>wss</code>) and resolve in the browser.
          </p>
        </>
      )}

      {reason === 'unknown-project' && (
        <>
          <p>
            The gateway responds (so it's running and reachable), but project <code>{project}</code>{' '}
            is not in its <code>projects.json</code> registry.
          </p>
          <ol>
            <li>
              Add an entry to the gateway's <code>projects.json</code>:
              <Copyable code={projectsJson} />
            </li>
            <li>
              Restart the gateway and check the project appears (<code>{project}</code> should be in{' '}
              <code>"projects"</code>):
              <Copyable code={health} />
            </li>
            <li>
              <code>{project}</code> is the <code>data-project</code> value on the widget's script
              tag. The key in projects.json must match it.
            </li>
          </ol>
        </>
      )}

      {reason === 'bad-token' && (
        <>
          <p>
            Project <code>{project}</code> has a token set on the gateway, but the widget sent{' '}
            {token ? 'a different one' : 'an empty one'}.
          </p>
          <ol>
            <li>
              Set the token on the site side — the <code>data-token</code> attribute on the widget's
              script tag:
              <Copyable code={scriptTag} />
            </li>
            <li>
              It must match the <code>token</code> field of this project in the gateway's{' '}
              <code>projects.json</code>.
            </li>
            <li>After editing, reload the page — the token is read from the tag on load.</li>
          </ol>
          <p class="diag-note">
            The token is simple protection: so another site can't reach your repo through the gateway.
          </p>
        </>
      )}

      {reason === 'protocol' && (
        <p>
          {detail || 'Incompatible protocol version.'} Update the widget (npm-asset{' '}
          <code>carono-ai-dialog-widget</code>) and the gateway to compatible versions.
        </p>
      )}

      {reason === 'other' && <p>{detail}</p>}

      <div class="diag-vals">
        <span>
          status: <code>{statusText}</code>
        </span>
        <span>
          address: <code>{gateway}</code>
        </span>
        <span>
          project: <code>{project}</code>
        </span>
        <span>
          token: <code>{token && token.length ? 'set' : 'not set'}</code>
        </span>
        {detail && reason !== 'other' && reason !== 'protocol' && (
          <span>
            details: <code>{detail}</code>
          </span>
        )}
      </div>

      <div class="diag-actions">
        <button class="diag-retry" onClick={onRetry}>
          ↻ Check again
        </button>
        <button class="diag-retry" onClick={onSettings}>
          ⚙ Change gateway
        </button>
        <a class="diag-docs" href={DOCS_URL} target="_blank" rel="noopener noreferrer">
          Setup guide →
        </a>
      </div>
    </div>
  );
}

// --- Connection settings (claude-code / custom gateway) ---

interface SettingsProps {
  conn: Conn;
  /** Page's data-* values, used to pre-fill the custom fields sensibly. */
  page: { project: string; gateway: string; token?: string };
  onApply: (next: Conn) => void;
  onClose: () => void;
}

/** Panel for choosing the connection mode and manual parameters. */
function Settings({ conn, page, onApply, onClose }: SettingsProps) {
  const [mode, setMode] = useState<Conn['mode']>(conn.mode);
  const [gateway, setGateway] = useState(conn.gateway || page.gateway || '');
  const [port, setPort] = useState(conn.port || DEFAULT_PORT);
  const [project, setProject] = useState(conn.project || page.project || '');
  const [token, setToken] = useState(conn.token || page.token || '');

  const apply = () =>
    onApply({
      mode,
      gateway: gateway.trim(),
      port: Number(port) || DEFAULT_PORT,
      project: project.trim(),
      token: token.trim(),
    });

  const customValid = mode === 'claude-code' || (gateway.trim() !== '' && project.trim() !== '');

  return (
    <div class="settings">
      <div class="settings-title">Connection</div>

      <label class="settings-mode">
        <input
          type="radio"
          checked={mode === 'claude-code'}
          onChange={() => setMode('claude-code')}
        />
        <span>
          <b>Claude Code</b> — local connector
          <small>
            <code>{localGatewayUrl(Number(port) || DEFAULT_PORT)}</code>; project and token come from
            the page settings
          </small>
        </span>
      </label>

      {mode === 'claude-code' && (
        <div class="settings-fields">
          <label>
            Port
            <input
              type="number"
              placeholder={String(DEFAULT_PORT)}
              value={port}
              onInput={(e) => setPort(Number((e.target as HTMLInputElement).value))}
            />
          </label>
        </div>
      )}

      <label class="settings-mode">
        <input type="radio" checked={mode === 'custom'} onChange={() => setMode('custom')} />
        <span>
          <b>Custom gateway</b> — set manually
        </span>
      </label>

      {mode === 'custom' && (
        <div class="settings-fields">
          <label>
            Gateway address
            <input
              type="text"
              placeholder="wss://your-gateway.example"
              value={gateway}
              onInput={(e) => setGateway((e.target as HTMLInputElement).value)}
            />
          </label>
          <label>
            Project
            <input
              type="text"
              placeholder="myapp"
              value={project}
              onInput={(e) => setProject((e.target as HTMLInputElement).value)}
            />
          </label>
          <label>
            Token
            <input
              type="text"
              placeholder="project secret (if set on the gateway)"
              value={token}
              onInput={(e) => setToken((e.target as HTMLInputElement).value)}
            />
          </label>
        </div>
      )}

      <div class="settings-actions">
        <button class="settings-apply" onClick={apply} disabled={!customValid}>
          Apply
        </button>
        <button class="settings-cancel" onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}

// --- Connection mode in localStorage ---

/** Effective connection parameters for the selected mode. */
function effectiveConn(
  conn: Conn,
  props: { project: string; token?: string },
): { gateway: string; project: string; token?: string } {
  const local = localGatewayUrl(conn.port || DEFAULT_PORT);
  if (conn.mode === 'custom') {
    return { gateway: conn.gateway || local, project: conn.project, token: conn.token || undefined };
  }
  return { gateway: local, project: props.project, token: props.token };
}

/** Signature of the page's data-* config; when it changes, the saved override is dropped. */
function connSig(props: { project: string; gateway: string; token?: string }): string {
  return `${props.project}|${props.gateway}|${props.token ?? ''}`;
}

/** Builds the connection from the page's data-* (custom for a remote gateway, else local). */
function deriveConn(props: { project: string; gateway: string; token?: string }, sig: string): Conn {
  const remote = props.gateway && props.gateway !== localGatewayUrl(DEFAULT_PORT);
  return {
    mode: remote ? 'custom' : 'claude-code',
    gateway: props.gateway || '',
    port: DEFAULT_PORT,
    project: props.project,
    token: props.token || '',
    src: sig,
  };
}

/**
 * Loads the saved choice, but only if it was saved against the current page config.
 * If the page's data-* changed (or nothing is saved), it re-derives from data-* — so
 * updating the page config "just works" without clearing storage.
 */
function loadConn(props: { project: string; gateway: string; token?: string }): Conn {
  const sig = connSig(props);
  try {
    const raw = localStorage.getItem(CONN_KEY);
    if (raw) {
      const c = JSON.parse(raw) as Partial<Conn>;
      if (c && (c.mode === 'claude-code' || c.mode === 'custom') && c.src === sig) {
        return {
          mode: c.mode,
          gateway: c.gateway || '',
          port: Number(c.port) || DEFAULT_PORT,
          project: c.project || '',
          token: c.token || '',
          src: sig,
        };
      }
    }
  } catch {
    /* noop */
  }
  return deriveConn(props, sig);
}

function saveConn(conn: Conn): void {
  try {
    localStorage.setItem(CONN_KEY, JSON.stringify(conn));
  } catch {
    /* noop */
  }
}

/** Code block with a "copy" button. */
function Copyable({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div class="diag-code">
      <pre>{code}</pre>
      <button
        class="diag-copy"
        onClick={() => {
          try {
            navigator.clipboard?.writeText(code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            /* noop */
          }
        }}
      >
        {copied ? '✓' : '⧉'}
      </button>
    </div>
  );
}

// --- Persisting the dialog to localStorage ---

function loadHistory(key: string): Msg[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const arr: unknown = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr
      .filter(
        (m): m is Msg =>
          !!m &&
          typeof (m as Msg).id === 'number' &&
          ((m as Msg).role === 'user' || (m as Msg).role === 'assistant') &&
          typeof (m as Msg).text === 'string',
      )
      .map((m) => ({ ...m, tools: Array.isArray(m.tools) ? m.tools : [] }))
      .slice(-HISTORY_LIMIT);
  } catch {
    return [];
  }
}

function saveHistory(key: string, msgs: Msg[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(msgs.slice(-HISTORY_LIMIT)));
  } catch {
    /* noop */
  }
}

function removeHistory(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* noop */
  }
}

function loadFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function saveFlag(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, value ? '1' : '0');
  } catch {
    /* noop */
  }
}
