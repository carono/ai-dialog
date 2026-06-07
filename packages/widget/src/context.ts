import type { FrameworkHints, PageContext, PageError } from '@ai-dialog/shared';

const VISIBLE_TEXT_LIMIT = 6000;
const ERROR_BUFFER = 10;

const errors: PageError[] = [];

/** Подключает перехват ошибок страницы (вызывать один раз при инициализации). */
export function initErrorCapture(): void {
  window.addEventListener('error', (e) => {
    push({
      message: e.message,
      source: e.filename,
      line: e.lineno,
      column: e.colno,
      stack: e.error?.stack,
      at: Date.now(),
    });
  });
  window.addEventListener('unhandledrejection', (e) => {
    push({ message: `Unhandled rejection: ${String(e.reason)}`, at: Date.now() });
  });

  const origError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    push({ message: args.map(stringify).join(' '), at: Date.now() });
    origError(...args);
  };
}

function push(err: PageError): void {
  errors.push(err);
  if (errors.length > ERROR_BUFFER) errors.shift();
}

function stringify(v: unknown): string {
  if (typeof v === 'string') return v;
  if (v instanceof Error) return v.message;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

/** Собирает текущий контекст страницы. */
export function collectContext(): PageContext {
  return {
    url: location.href,
    route: location.pathname,
    hash: location.hash,
    title: document.title,
    referrer: document.referrer,
    lang: document.documentElement.lang || navigator.language,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    meta: collectMeta(),
    selection: window.getSelection()?.toString().trim() || undefined,
    visibleText: collectVisibleText(),
    hints: collectHints(),
    errors: errors.length ? [...errors] : undefined,
  };
}

function collectMeta(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const el of document.querySelectorAll('meta')) {
    const key = el.getAttribute('name') || el.getAttribute('property');
    const content = el.getAttribute('content');
    if (key && content) out[key] = content;
  }
  return out;
}

function collectVisibleText(): string | undefined {
  const text = document.body?.innerText?.replace(/\s+\n/g, '\n').trim();
  if (!text) return undefined;
  return text.length > VISIBLE_TEXT_LIMIT ? text.slice(0, VISIBLE_TEXT_LIMIT) : text;
}

function collectHints(): FrameworkHints {
  const frameworks: string[] = [];
  const w = window as unknown as Record<string, unknown>;
  if (w.React || document.querySelector('[data-reactroot], #__next')) frameworks.push('react');
  if (w.__VUE__ || document.querySelector('[data-v-app], #__nuxt')) frameworks.push('vue');
  if (w.ng || document.querySelector('[ng-version]')) frameworks.push('angular');
  if (document.querySelector('[class*="svelte-"]')) frameworks.push('svelte');

  const markers: Record<string, string> = {};
  for (const el of document.querySelectorAll<HTMLElement>(
    '[data-ai-route], [data-ai-file], [data-ai-component]',
  )) {
    for (const attr of ['ai-route', 'ai-file', 'ai-component'] as const) {
      const v = el.dataset[toCamel(attr)];
      if (v) markers[attr] = v;
    }
  }

  return { frameworks, markers };
}

function toCamel(s: string): string {
  return s.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}
