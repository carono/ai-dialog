import type { AdapterInput, AgentEvent, EndpointAdapter } from '@ai-dialog/shared';
import type { ProjectConfig } from '../config.js';
import { renderContext } from './context-prompt.js';

const READONLY_TOOLS = ['Read', 'Grep', 'Glob', 'Bash'];
const WRITE_TOOLS = [...READONLY_TOOLS, 'Edit', 'Write', 'MultiEdit'];

const SYSTEM_PROMPT = [
  'You are an assistant embedded into a running application through a widget.',
  'The user asks a question while on a specific page. The <page_context> block',
  'provides "coordinates": URL, route, title, visible text, framework hints.',
  'You have access to this application\'s repository (the working directory is its root).',
  'Use the context to locate the corresponding route/controller/component/template yourself',
  'and answer concretely about the code. If edits are disallowed, only explain and show, do not edit.',
].join(' ');

/**
 * The "Claude Code session" adapter via @anthropic-ai/claude-agent-sdk.
 * Runs the agent with cwd = the project repository root; the agent resolves
 * the page context into source files on its own.
 */
export class ClaudeCodeAdapter implements EndpointAdapter {
  readonly kind = 'claude-code';

  /** Mapping of our sessionId -> agent session_id (to continue the dialog). */
  private readonly sdkSessions = new Map<string, string>();

  constructor(private readonly project: ProjectConfig) {
    if (!project.repoPath) {
      throw new Error('claude-code adapter requires repoPath in the project config');
    }
  }

  async *send(input: AdapterInput): AsyncIterable<AgentEvent> {
    const { query } = await loadSdk();

    const prompt = `${renderContext(input.context)}\n\nUser question:\n${input.message}`;
    const resume = this.sdkSessions.get(input.sessionId);

    const stream = query({
      prompt,
      options: {
        cwd: this.project.repoPath,
        appendSystemPrompt: SYSTEM_PROMPT,
        allowedTools: this.project.allowWrite ? WRITE_TOOLS : READONLY_TOOLS,
        permissionMode: this.project.allowWrite ? 'acceptEdits' : 'default',
        includePartialMessages: true,
        ...(resume ? { resume } : {}),
        abortController: toController(input.signal),
      },
    });

    try {
      for await (const message of stream as AsyncIterable<SdkMessage>) {
        if (message.session_id) this.sdkSessions.set(input.sessionId, message.session_id);

        for (const event of mapMessage(message)) yield event;

        if (message.type === 'result') {
          yield { type: 'done' };
          return;
        }
      }
      yield { type: 'done' };
    } catch (err) {
      if (input.signal.aborted) return;
      yield { type: 'error', message: (err as Error).message };
    }
  }
}

/** Converts a single SDK message into zero or more of our events. */
function* mapMessage(message: SdkMessage): Iterable<AgentEvent> {
  // Incremental text — from partial stream events.
  if (message.type === 'stream_event' && message.event) {
    const ev = message.event;
    if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta' && ev.delta.text) {
      yield { type: 'text', text: ev.delta.text };
    }
    return;
  }

  // Tool calls — from full assistant messages (the text already arrived as deltas).
  if (message.type === 'assistant' && message.message?.content) {
    for (const block of message.message.content) {
      if (block.type === 'tool_use') {
        yield { type: 'tool_use', name: block.name ?? 'tool', input: block.input };
      }
    }
  }
}

/** Turns an AbortSignal into an AbortController (the SDK expects a controller). */
function toController(signal: AbortSignal): AbortController {
  const controller = new AbortController();
  if (signal.aborted) controller.abort();
  else signal.addEventListener('abort', () => controller.abort(), { once: true });
  return controller;
}

// --- SDK loading (dynamic, so the gateway starts without it for other endpoints) ---

interface SdkModule {
  query: (args: { prompt: string; options: Record<string, unknown> }) => AsyncIterable<unknown>;
}

let sdkPromise: Promise<SdkModule> | undefined;

function loadSdk(): Promise<SdkModule> {
  if (!sdkPromise) {
    sdkPromise = import('@anthropic-ai/claude-agent-sdk').then(
      (m) => m as unknown as SdkModule,
      (err) => {
        throw new Error(
          `Failed to load @anthropic-ai/claude-agent-sdk: ${(err as Error).message}. ` +
            'Install it: pnpm --filter @ai-dialog/gateway add @anthropic-ai/claude-agent-sdk',
        );
      },
    );
  }
  return sdkPromise;
}

// --- Loose SDK message types (the shape depends on the version) ---

interface SdkMessage {
  type: string;
  session_id?: string;
  message?: { content?: SdkContentBlock[] };
  event?: SdkStreamEvent;
}

interface SdkContentBlock {
  type: string;
  name?: string;
  input?: unknown;
}

interface SdkStreamEvent {
  type: string;
  delta?: { type?: string; text?: string };
}
