/**
 * Context of the current page that the widget collects in the browser and passes to the gateway.
 *
 * Principle: the widget provides "coordinates" — where the user is and what they see.
 * Resolving the route/URL into specific source files is the job of the endpoint agent
 * (Claude Code / opencode), which has access to the repository.
 */
export interface PageContext {
  /** Full page URL (location.href). */
  url: string;
  /** Route path (location.pathname; for SPA — current after navigation). */
  route: string;
  /** Hash part (for hash routing). */
  hash: string;
  /** Document title. */
  title: string;
  /** Referrer, if present. */
  referrer: string;
  /** Interface language (document.documentElement.lang / navigator.language). */
  lang: string;
  /** Viewport size. */
  viewport: { width: number; height: number };
  /** Extracted meta tags (name/property -> content). */
  meta: Record<string, string>;
  /** Text selected by the user at the moment of sending (if any). */
  selection?: string;
  /** Element picked via the widget inspector (the "pick element" button). */
  selectedElement?: SelectedElement;
  /** A short slice of the page's visible text (trimmed to a limit). */
  visibleText?: string;
  /** Hints about the framework/stack, detected by heuristics. */
  hints?: FrameworkHints;
  /** Recent errors from console.error / window.onerror. */
  errors?: PageError[];
}

export interface SelectedElement {
  /** Unique CSS path to the element. */
  selector: string;
  /** Tag in lowercase. */
  tag: string;
  /** id, if present. */
  id?: string;
  /** Classes, if present. */
  classes?: string[];
  /** Visible text of the element (trimmed). */
  text?: string;
  /** outerHTML of the element (trimmed). */
  html?: string;
  /** Geometry at the moment of selection. */
  rect?: { x: number; y: number; width: number; height: number };
}

export interface FrameworkHints {
  /** Detected frameworks: 'react' | 'vue' | 'angular' | 'svelte' | ... */
  frameworks: string[];
  /** Values of data-* attributes marked as hints (data-ai-*). */
  markers: Record<string, string>;
}

export interface PageError {
  message: string;
  source?: string;
  line?: number;
  column?: number;
  stack?: string;
  /** Timestamp (epoch ms). */
  at: number;
}
