import Anthropic from '@anthropic-ai/sdk';
import type { AdapterInput, AgentEvent, EndpointAdapter } from '@ai-dialog/shared';
import { renderContext } from './context-prompt.js';

const MODEL = 'claude-opus-4-8';

const SYSTEM_PROMPT = [
  'Ты — ассистент, встроенный в веб-приложение через виджет.',
  'В блоке <page_context> дан контекст текущей страницы пользователя.',
  'Отвечай по сути, опираясь на этот контекст. Доступа к исходному коду нет —',
  'если вопрос требует кода, скажи об этом и работай с тем, что видно на странице.',
].join(' ');

/**
 * Адаптер «наш дашборд»: прямой вызов Claude API без агента-кодера.
 * Держит историю диалога по sessionId в памяти процесса.
 */
export class DashboardAdapter implements EndpointAdapter {
  readonly kind = 'dashboard';

  private readonly client = new Anthropic();
  private readonly histories = new Map<string, Anthropic.MessageParam[]>();

  async *send(input: AdapterInput): AsyncIterable<AgentEvent> {
    const history = this.histories.get(input.sessionId) ?? [];
    const userContent = `${renderContext(input.context)}\n\n${input.message}`;
    const messages: Anthropic.MessageParam[] = [
      ...history,
      { role: 'user', content: userContent },
    ];

    let assistantText = '';
    try {
      const stream = this.client.messages.stream(
        {
          model: MODEL,
          max_tokens: 8000,
          system: SYSTEM_PROMPT,
          messages,
        },
        { signal: input.signal },
      );

      for await (const event of stream) {
        if (
          event.type === 'content_block_delta' &&
          event.delta.type === 'text_delta' &&
          event.delta.text
        ) {
          assistantText += event.delta.text;
          yield { type: 'text', text: event.delta.text };
        }
      }
      await stream.finalMessage();

      // Сохраняем ход диалога для продолжения.
      this.histories.set(input.sessionId, [
        ...messages,
        { role: 'assistant', content: assistantText },
      ]);

      yield { type: 'done' };
    } catch (err) {
      if (input.signal.aborted) return;
      yield { type: 'error', message: (err as Error).message };
    }
  }
}
