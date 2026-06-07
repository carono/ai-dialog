import type { AdapterInput, AgentEvent, EndpointAdapter } from '@ai-dialog/shared';
import type { ProjectConfig } from '../config.js';
import { renderContext } from './context-prompt.js';

const READONLY_TOOLS = ['Read', 'Grep', 'Glob', 'Bash'];
const WRITE_TOOLS = [...READONLY_TOOLS, 'Edit', 'Write', 'MultiEdit'];

const SYSTEM_PROMPT = [
  'Ты — ассистент, встроенный в работающее приложение через виджет.',
  'Пользователь задаёт вопрос, находясь на конкретной странице. В блоке <page_context>',
  'даны «координаты»: URL, маршрут, заголовок, видимый текст, подсказки о фреймворке.',
  'У тебя есть доступ к репозиторию этого приложения (рабочая директория — его корень).',
  'Используй контекст, чтобы самостоятельно найти соответствующий роут/контроллер/компонент/шаблон',
  'и отвечай предметно по коду. Если правки запрещены — только объясняй и показывай, не редактируй.',
].join(' ');

/**
 * Адаптер «сессия Claude Code» через @anthropic-ai/claude-agent-sdk.
 * Запускает агента с cwd = корень репозитория проекта; агент сам резолвит
 * контекст страницы в файлы исходников.
 */
export class ClaudeCodeAdapter implements EndpointAdapter {
  readonly kind = 'claude-code';

  /** Маппинг нашей sessionId -> session_id агента (для продолжения диалога). */
  private readonly sdkSessions = new Map<string, string>();

  constructor(private readonly project: ProjectConfig) {
    if (!project.repoPath) {
      throw new Error('claude-code адаптер требует repoPath в конфиге проекта');
    }
  }

  async *send(input: AdapterInput): AsyncIterable<AgentEvent> {
    const { query } = await loadSdk();

    const prompt = `${renderContext(input.context)}\n\nВопрос пользователя:\n${input.message}`;
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

/** Преобразует одно сообщение SDK в ноль или более наших событий. */
function* mapMessage(message: SdkMessage): Iterable<AgentEvent> {
  // Инкрементальный текст — из частичных stream-событий.
  if (message.type === 'stream_event' && message.event) {
    const ev = message.event;
    if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta' && ev.delta.text) {
      yield { type: 'text', text: ev.delta.text };
    }
    return;
  }

  // Вызовы инструментов — из полных assistant-сообщений (текст уже пришёл дельтами).
  if (message.type === 'assistant' && message.message?.content) {
    for (const block of message.message.content) {
      if (block.type === 'tool_use') {
        yield { type: 'tool_use', name: block.name ?? 'tool', input: block.input };
      }
    }
  }
}

/** Превращает AbortSignal в AbortController (SDK ожидает controller). */
function toController(signal: AbortSignal): AbortController {
  const controller = new AbortController();
  if (signal.aborted) controller.abort();
  else signal.addEventListener('abort', () => controller.abort(), { once: true });
  return controller;
}

// --- Загрузка SDK (динамически, чтобы шлюз стартовал без него для др. эндпоинтов) ---

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
          `Не удалось загрузить @anthropic-ai/claude-agent-sdk: ${(err as Error).message}. ` +
            'Установите пакет: pnpm --filter @ai-dialog/gateway add @anthropic-ai/claude-agent-sdk',
        );
      },
    );
  }
  return sdkPromise;
}

// --- Нестрогие типы сообщений SDK (форма зависит от версии) ---

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
