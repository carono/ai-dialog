import type { AdapterInput, AgentEvent, EndpointAdapter } from '@ai-dialog/shared';
import type { ProjectConfig } from '../config.js';

/**
 * Адаптер opencode (server-режим, HTTP API).
 * ЗАГЛУШКА: интеграция будет добавлена после Claude Code MVP.
 * Базовый URL берётся из OPENCODE_BASE_URL.
 */
export class OpencodeAdapter implements EndpointAdapter {
  readonly kind = 'opencode';

  constructor(private readonly project: ProjectConfig) {}

  // eslint-disable-next-line require-yield
  async *send(_input: AdapterInput): AsyncIterable<AgentEvent> {
    void this.project;
    yield {
      type: 'error',
      message:
        'opencode-адаптер ещё не реализован. На текущем этапе используйте endpoint "claude-code" или "dashboard".',
    };
  }
}
