import type { EndpointAdapter } from '@ai-dialog/shared';
import type { ProjectConfig } from '../config.js';
import { ClaudeCodeAdapter } from './claude-code.js';
import { ExternalAdapter } from './external.js';
import { OpencodeAdapter } from './opencode.js';

/** Adapter cache by project (to reuse history/sessions). */
const cache = new Map<string, EndpointAdapter>();

/** Creates (or retrieves from cache) the adapter for a project. */
export function getAdapter(project: string, config: ProjectConfig): EndpointAdapter {
  const existing = cache.get(project);
  if (existing) return existing;

  const adapter = build(config);
  cache.set(project, adapter);
  return adapter;
}

function build(config: ProjectConfig): EndpointAdapter {
  switch (config.endpoint) {
    case 'claude-code':
      return new ClaudeCodeAdapter(config);
    case 'opencode':
      return new OpencodeAdapter(config);
    case 'external':
      return new ExternalAdapter(config);
    default:
      throw new Error(`Unknown endpoint: ${(config as ProjectConfig).endpoint}`);
  }
}
