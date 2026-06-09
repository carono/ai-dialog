import type { AgentEvent } from './adapter.js';
import type { PageContext } from './context.js';

/** Widget ↔ gateway protocol version. Bump on incompatible changes. */
export const PROTOCOL_VERSION = 1;

/** Messages the widget sends to the gateway. */
export type ClientMessage =
  /** First message after the WS opens: the widget's introduction. */
  | {
      type: 'hello';
      protocol: number;
      /** Project identifier (data-project on the script). */
      project: string;
      /** Project access token (if authentication is enabled). */
      token?: string;
      /**
       * Client-saved sessionId to continue the dialog.
       * If set and valid — the gateway continues the same session (resume),
       * otherwise it creates a new one. Empty/absent — a new session.
       */
      sessionId?: string;
    }
  /** A user message in the dialog. */
  | {
      type: 'user_message';
      sessionId: string;
      text: string;
      context: PageContext;
    }
  /** Abort the current response. */
  | { type: 'abort'; sessionId: string };

/** Messages the gateway sends to the widget. */
export type ServerMessage =
  /** hello acknowledgement: the session is created, messages can be sent. */
  | { type: 'ready'; sessionId: string; endpoint: string }
  /** The next event from the endpoint. */
  | { type: 'event'; sessionId: string; event: AgentEvent }
  /** Protocol/infrastructure error (not from the agent). */
  | { type: 'error'; message: string };
