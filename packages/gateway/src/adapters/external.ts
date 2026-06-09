import { pathToFileURL } from 'node:url';
import type { AdapterInput, AgentEvent, EndpointAdapter } from '@ai-dialog/shared';
import type { ProjectConfig } from '../config.js';

/** External adapter factory: the module default-exports it. */
type AdapterFactory = (config: ProjectConfig) => EndpointAdapter;

/**
 * The `external` adapter — loads the implementation from a file at the `module` path in the
 * project config. This keeps personal/project adapters outside this repository: drop a
 * .js/.mjs module with `export default (config) => adapter` and set the path in projects.json.
 *
 * The import is lazy (on the first request), so the gateway starts even if the path is broken.
 */
export class ExternalAdapter implements EndpointAdapter {
  readonly kind = 'external';
  private inner?: EndpointAdapter;

  constructor(private readonly config: ProjectConfig) {
    if (!config.module) {
      throw new Error('external adapter requires "module" (path to the adapter file) in the project config');
    }
  }

  async *send(input: AdapterInput): AsyncIterable<AgentEvent> {
    if (!this.inner) {
      const url = pathToFileURL(this.config.module as string).href;
      const mod = (await import(url)) as { default?: unknown };
      const factory = mod.default;
      if (typeof factory !== 'function') {
        throw new Error(
          `external adapter "${this.config.module}" must default-export a factory: (config) => adapter`,
        );
      }
      this.inner = (factory as AdapterFactory)(this.config);
    }
    yield* this.inner.send(input);
  }
}
