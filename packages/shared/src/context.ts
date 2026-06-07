/**
 * Контекст текущей страницы, который виджет собирает в браузере и передаёт в шлюз.
 *
 * Принцип: виджет отдаёт «координаты» — где пользователь находится и что видит.
 * Резолвить роут/URL в конкретные файлы исходников должен агент-эндпоинт
 * (Claude Code / opencode), у которого есть доступ к репозиторию.
 */
export interface PageContext {
  /** Полный URL страницы (location.href). */
  url: string;
  /** Путь маршрута (location.pathname; для SPA — актуальный после навигации). */
  route: string;
  /** Hash-часть (для hash-роутинга). */
  hash: string;
  /** Заголовок документа. */
  title: string;
  /** Referrer, если есть. */
  referrer: string;
  /** Язык интерфейса (document.documentElement.lang / navigator.language). */
  lang: string;
  /** Размер вьюпорта. */
  viewport: { width: number; height: number };
  /** Извлечённые meta-теги (name/property -> content). */
  meta: Record<string, string>;
  /** Текст, выделенный пользователем на момент отправки (если есть). */
  selection?: string;
  /** Элемент, выбранный через инспектор виджета (кнопка «выбрать элемент»). */
  selectedElement?: SelectedElement;
  /** Краткий срез видимого текста страницы (обрезается по лимиту). */
  visibleText?: string;
  /** Подсказки о фреймворке/стеке, обнаруженные эвристиками. */
  hints?: FrameworkHints;
  /** Последние ошибки из console.error / window.onerror. */
  errors?: PageError[];
}

export interface SelectedElement {
  /** Уникальный CSS-путь к элементу. */
  selector: string;
  /** Тег в нижнем регистре. */
  tag: string;
  /** id, если есть. */
  id?: string;
  /** Классы, если есть. */
  classes?: string[];
  /** Видимый текст элемента (обрезается). */
  text?: string;
  /** outerHTML элемента (обрезается). */
  html?: string;
  /** Геометрия на момент выбора. */
  rect?: { x: number; y: number; width: number; height: number };
}

export interface FrameworkHints {
  /** Обнаруженные фреймворки: 'react' | 'vue' | 'angular' | 'svelte' | ... */
  frameworks: string[];
  /** Значения data-* атрибутов, помеченных как подсказки (data-ai-*). */
  markers: Record<string, string>;
}

export interface PageError {
  message: string;
  source?: string;
  line?: number;
  column?: number;
  stack?: string;
  /** Метка времени (epoch ms). */
  at: number;
}
