import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export type EndpointKind = 'claude-code' | 'opencode' | 'external';

export interface ProjectConfig {
  /** Which endpoint serves the project. */
  endpoint: EndpointKind;
  /** Absolute path to the repository (for claude-code / opencode). */
  repoPath?: string;
  /**
   * Absolute path to the external adapter (for the "external" endpoint). The module must
   * default-export a factory `(config) => EndpointAdapter`. This keeps personal/
   * project adapters outside this repository. See docs/INTEGRATION.md.
   */
  module?: string;
  /** Project secret token. If set, the widget must send it in hello. */
  token?: string;
  /**
   * Allow the agent to modify files. Defaults to false — read-only
   * (read/grep/glob), so a stray request from the site won't edit the sources.
   */
  allowWrite?: boolean;
}

export type ProjectsConfig = Record<string, ProjectConfig>;

export interface GatewayConfig {
  host: string;
  port: number;
  projects: ProjectsConfig;
}

function loadProjects(): ProjectsConfig {
  const path = process.env.PROJECTS_CONFIG
    ? resolve(process.env.PROJECTS_CONFIG)
    : fileURLToPath(new URL('../projects.json', import.meta.url));
  try {
    const raw = readFileSync(path, 'utf8');
    return JSON.parse(raw) as ProjectsConfig;
  } catch (err) {
    console.warn(`[config] failed to read the project registry (${path}):`, (err as Error).message);
    console.warn('[config] starting with an empty registry — add projects.json');
    return {};
  }
}

export function loadConfig(): GatewayConfig {
  return {
    host: process.env.GATEWAY_HOST || '127.0.0.1',
    port: Number(process.env.GATEWAY_PORT || 8787),
    projects: loadProjects(),
  };
}
