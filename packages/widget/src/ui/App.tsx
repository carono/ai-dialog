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
  const [open, setOpen] = useState(false);
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
            <div class="diag">
              <b>Нет связи со шлюзом</b> — {statusText}
              <div class="diag-row">
                адрес: <code>{gateway}</code>
              </div>
              <div class="diag-row">
                проект: <code>{project}</code>
              </div>
              {diag && (
                <div class="diag-row">
                  детали: <code>{diag}</code>
                </div>
              )}
              <div class="diag-hint">
                Проверьте: 1) запущен ли шлюз; 2) проксируется ли <code>{wsHost}</code> на шлюз
                с WebSocket-upgrade (wss); 3) резолвится ли домен в браузере.
              </div>
            </div>
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
