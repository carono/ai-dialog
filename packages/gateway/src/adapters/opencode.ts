import type { AdapterInput, AgentEvent, EndpointAdapter } from '@ai-dialog/shared';
import type { ProjectConfig } from '../config.js';

/**
 * The opencode adapter (server mode, HTTP API).
 * STUB: the integration will be added after the Claude Code MVP.
 * The base URL is taken from OPENCODE_BASE_URL.
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
        'opencode adapter is not implemented yet. Use endpoint "claude-code", or "external" for your own adapter.',
    };
  }
}
