import type { PageContext } from './context.js';

/**
 * A unified event that any endpoint adapter streams outward.
 * The gateway relays these events to the widget as-is.
 */
export type AgentEvent =
  /** Incremental response text (delta). */
  | { type: 'text'; text: string }
  /** Visible reasoning block (if the endpoint provides one). */
  | { type: 'thinking'; text: string }
  /** The agent invoked a tool (read/grep/bash/edit, etc.). */
  | { type: 'tool_use'; name: string; input?: unknown }
  /** Tool result (optional, for UI indication). */
  | { type: 'tool_result'; name?: string; ok: boolean }
  /** Response completed normally. */
  | { type: 'done' }
  /** Error during execution. */
  | { type: 'error'; message: string };

export interface AdapterInput {
  /** Session identifier (one dialog = one session). */
  sessionId: string;
  /** User message text. */
  message: string;
  /** Page context at the moment of sending. */
  context: PageContext;
  /** Cancellation signal — the gateway triggers abort on disconnect/stop command. */
  signal: AbortSignal;
}

/**
 * Endpoint adapter contract. Implementations: Claude Code (Agent SDK),
 * opencode (HTTP), our dashboard (Claude API directly).
 */
export interface EndpointAdapter {
  /** Human-readable name for logs. */
  readonly kind: string;
  /** Streams response events for a single user message. */
  send(input: AdapterInput): AsyncIterable<AgentEvent>;
}
