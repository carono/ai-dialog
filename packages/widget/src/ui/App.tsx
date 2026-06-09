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

export function App({ project, gateway, token }: Props) {
  const histKey = `aidlg.hist.${project}`;
  const pinnedKey = `aidlg.pinned.${project}`;
  const [pinned, setPinned] = useState(() => loadFlag(pinnedKey));
  // Если закреплено — панель открыта сразу при загрузке страницы.
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

  // Текущее ассистентское сообщение, в которое стримятся события.
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
    const t = new Transport(gateway, project, token, {
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
  }, [gateway, project, token, handleEvent]);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [messages, open]);

  // Сохраняем диалог в localStorage — переживает смену страницы и перезагрузку.
  useEffect(() => {
    saveHistory(histKey, messages);
  }, [histKey, messages]);

  // Запустить инспектор: свернуть панель, подсветка элементов, клик фиксирует.
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

  // Закрепить окно: оставаться открытым после перезагрузки страницы.
  const togglePin = useCallback(() => {
    setPinned((p) => {
      const v = !p;
      saveFlag(pinnedKey, v);
      return v;
    });
  }, [pinnedKey]);

  // Очистить: новая сессия на шлюзе + чистый диалог и история.
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
      return new URL(gateway).host;
    } catch {
      return gateway;
    }
  })();
  const statusText =
    status === 'ready'
      ? 'на связи'
      : status === 'connecting'
        ? 'подключаюсь…'
        : status === 'closed'
          ? 'соединение закрыто'
          : 'ошибка соединения';

  return (
    <>
      {open && (
        <div class="panel">
          <div class="header">
            <span class={`dot ${status === 'ready' ? 'ready' : ''}`} />
            <span class="title">AI диалог</span>
            {endpoint && <span class="endpoint">{endpoint}</span>}
            <button
              class={`pin ${pinned ? 'on' : ''}`}
              onClick={togglePin}
              title={pinned ? 'Закреплено: окно открывается при загрузке' : 'Закрепить окно открытым'}
            >
              📌
            </button>
            {messages.length > 0 && (
              <button class="clear" onClick={clear} title="Начать новый диалог">
                Очистить
              </button>
            )}
            <button class="close" onClick={() => setOpen(false)} aria-label="Закрыть">
              ×
            </button>
          </div>

          {status !== 'ready' && (
            <Diagnostics
              reason={classifyDiag(status, diag)}
              statusText={statusText}
              gateway={gateway}
              wsHost={wsHost}
              project={project}
              token={token}
              detail={diag}
              onRetry={() => transportRef.current?.retry()}
            />
          )}

          <div class="body" ref={bodyRef}>
            {messages.length === 0 ? (
              <div class="empty">
                Спросите что-нибудь о текущей странице. Контекст (URL, маршрут, видимый текст)
                уйдёт вместе с вопросом.
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
              <button class="picked-x" onClick={() => setSelectedEl(null)} title="Убрать элемент">
                ✕
              </button>
            </div>
          )}

          <div class="footer">
            <button
              class="pick"
              onClick={startPick}
              disabled={status !== 'ready'}
              title="Выбрать элемент на странице"
            >
              ⌖
            </button>
            <textarea
              rows={1}
              placeholder="Ваш вопрос…"
              value={input}
              onInput={(e) => setInput((e.target as HTMLTextAreaElement).value)}
              onKeyDown={onKeyDown}
            />
            {busy ? (
              <button class="stop" onClick={stop}>
                Стоп
              </button>
            ) : (
              <button onClick={send} disabled={!input.trim() || status !== 'ready'}>
                ➤
              </button>
            )}
          </div>
        </div>
      )}

      {picking && (
        <div class="pick-hint">Кликните элемент на странице · Esc — отмена</div>
      )}

      <button class="launcher" onClick={() => setOpen((v) => !v)} aria-label="AI диалог">
        {open ? '×' : '💬'}
      </button>
    </>
  );
}

// --- Диагностика и самонастройка ---

/** Полная инструкция по развёртыванию шлюза и подключению (для человека и ИИ-агента). */
const DOCS_URL = 'https://github.com/carono/ai-dialog/blob/master/docs/INTEGRATION.md';

type DiagReason = 'connecting' | 'no-gateway' | 'unknown-project' | 'bad-token' | 'protocol' | 'other';

/** Определяет причину по статусу транспорта и тексту серверной ошибки. */
function classifyDiag(status: TransportStatus, diag: string): DiagReason {
  const d = diag.toLowerCase();
  if (d.includes('неизвестный проект')) return 'unknown-project';
  if (d.includes('токен')) return 'bad-token';
  if (d.includes('протокол')) return 'protocol';
  if (status === 'connecting') return 'connecting';
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
}

/** Блок «что не так и как починить» — основной онбординг-экран виджета. */
function Diagnostics({ reason, statusText, gateway, wsHost, project, token, detail, onRetry }: DiagProps) {
  const tokenVal = token && token.length ? token : 'ПРИДУМАЙТЕ-СЕКРЕТ';
  const health = 'curl -s http://127.0.0.1:8787/health';
  const projectsJson =
    `"${project}": {\n` +
    '  "endpoint": "claude-code",\n' +
    '  "repoPath": "/абсолютный/путь/к/репозиторию",\n' +
    `  "token": "${tokenVal}",\n` +
    '  "allowWrite": false\n' +
    '}';
  const scriptTag =
    '<script src=".../widget.js"\n' +
    `  data-project="${project}"\n` +
    `  data-gateway="${gateway}"\n` +
    `  data-token="${tokenVal}"></script>`;

  const title =
    reason === 'connecting'
      ? 'Подключаюсь к шлюзу…'
      : reason === 'unknown-project'
        ? 'Проект не заведён на шлюзе'
        : reason === 'bad-token'
          ? token
            ? 'Неверный токен проекта'
            : 'Не указан токен проекта'
          : reason === 'protocol'
            ? 'Версии виджета и шлюза не совпадают'
            : reason === 'other'
              ? 'Не удалось подключиться'
              : 'Шлюз недоступен';

  return (
    <div class="diag">
      <div class="diag-title">{title}</div>

      {reason === 'connecting' && (
        <p>
          Устанавливаю WebSocket-соединение с <code>{wsHost}</code>. Если надолго зависло — шлюз,
          скорее всего, недоступен (что это и как проверить — см. ниже).
        </p>
      )}

      {reason === 'no-gateway' && (
        <>
          <p>
            Виджет — это только клиент. Чтобы он отвечал, нужен общий сервис-<b>шлюз</b>: он
            принимает соединения виджетов и по паре <code>project</code>+<code>token</code>{' '}
            направляет запрос в AI-движок с доступом к коду проекта. Один шлюз обслуживает все
            проекты.
          </p>
          <ol>
            <li>
              Проверьте, что шлюз запущен (на его машине) — ждём <code>{'{"ok":true,…}'}</code>:
              <Copyable code={health} />
            </li>
            <li>
              Браузер ходит по <code>wss</code>, поэтому <code>{wsHost}</code> должен проксироваться
              на шлюз с WebSocket-upgrade и резолвиться в браузере.
            </li>
            <li>Если шлюзом управляете не вы — попросите владельца поднять его (инструкция ниже).</li>
          </ol>
        </>
      )}

      {reason === 'unknown-project' && (
        <>
          <p>
            Шлюз отвечает (значит, он работает и доступен), но проекта <code>{project}</code> нет в
            его реестре <code>projects.json</code>.
          </p>
          <ol>
            <li>
              Добавьте запись в <code>projects.json</code> шлюза:
              <Copyable code={projectsJson} />
            </li>
            <li>
              Перезапустите шлюз и проверьте, что проект появился (в <code>"projects"</code> должен
              быть <code>{project}</code>):
              <Copyable code={health} />
            </li>
            <li>
              <code>{project}</code> — это значение <code>data-project</code> на теге скрипта
              виджета. Ключ в projects.json должен совпадать.
            </li>
          </ol>
        </>
      )}

      {reason === 'bad-token' && (
        <>
          <p>
            У проекта <code>{project}</code> на шлюзе задан токен, а виджет прислал{' '}
            {token ? 'другой' : 'пустой'}.
          </p>
          <ol>
            <li>
              Укажите токен на стороне сайта — атрибут <code>data-token</code> на теге скрипта
              виджета:
              <Copyable code={scriptTag} />
            </li>
            <li>
              Он должен совпадать с полем <code>token</code> этого проекта в{' '}
              <code>projects.json</code> шлюза.
            </li>
            <li>После правки перезагрузите страницу — токен читается из тега при загрузке.</li>
          </ol>
          <p class="diag-note">
            Токен — простая защита: чтобы чужой сайт не дёргал ваш репозиторий через шлюз.
          </p>
        </>
      )}

      {reason === 'protocol' && (
        <p>
          {detail || 'Несовместимая версия протокола.'} Обновите виджет (npm-asset{' '}
          <code>carono-ai-dialog-widget</code>) и шлюз до совместимых версий.
        </p>
      )}

      {reason === 'other' && <p>{detail}</p>}

      <div class="diag-vals">
        <span>
          статус: <code>{statusText}</code>
        </span>
        <span>
          адрес: <code>{gateway}</code>
        </span>
        <span>
          проект: <code>{project}</code>
        </span>
        <span>
          токен: <code>{token && token.length ? 'задан' : 'не задан'}</code>
        </span>
        {detail && reason !== 'other' && reason !== 'protocol' && (
          <span>
            детали: <code>{detail}</code>
          </span>
        )}
      </div>

      <div class="diag-actions">
        <button class="diag-retry" onClick={onRetry}>
          ↻ Проверить снова
        </button>
        <a class="diag-docs" href={DOCS_URL} target="_blank" rel="noopener noreferrer">
          Инструкция по настройке →
        </a>
      </div>
    </div>
  );
}

/** Блок кода с кнопкой «копировать». */
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

// --- Сохранение диалога в localStorage ---

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
