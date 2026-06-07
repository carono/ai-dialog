import type { EndpointAdapter } from '@ai-dialog/shared';
import type { ProjectConfig } from '../config.js';
import { ClaudeCodeAdapter } from './claude-code.js';
import { DashboardAdapter } from './dashboard.js';
import { CaronoChannelAdapter } from './carono-channel.js';
import { OpencodeAdapter } from './opencode.js';

/** Кэш адаптеров по проекту (чтобы переиспользовать историю/сессии). */
const cache = new Map<string, EndpointAdapter>();

/** Создаёт (или достаёт из кэша) адаптер для проекта. */
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
    case 'dashboard':
      return new DashboardAdapter();
    case 'carono-channel':
      return new CaronoChannelAdapter(config);
    case 'opencode':
      return new OpencodeAdapter(config);
    default:
      throw new Error(`Неизвестный endpoint: ${(config as ProjectConfig).endpoint}`);
  }
}
