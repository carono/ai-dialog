import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export type EndpointKind = 'claude-code' | 'opencode' | 'dashboard' | 'dashboard-channel';

export interface ProjectConfig {
  /** Какой эндпоинт обслуживает проект. */
  endpoint: EndpointKind;
  /** Абсолютный путь к репозиторию (для claude-code / opencode). */
  repoPath?: string;
  /** id проекта в реестре дашборда (для endpoint dashboard-channel; опц., иначе резолв по repoPath). */
  dashboardProjectId?: string;
  /** Секретный токен проекта. Если задан — виджет обязан прислать его в hello. */
  token?: string;
  /**
   * Разрешить агенту изменять файлы. По умолчанию false — только чтение
   * (read/grep/glob), чтобы случайный запрос с сайта не правил исходники.
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
    console.warn(`[config] не удалось прочитать реестр проектов (${path}):`, (err as Error).message);
    console.warn('[config] стартуем с пустым реестром — добавьте projects.json');
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
