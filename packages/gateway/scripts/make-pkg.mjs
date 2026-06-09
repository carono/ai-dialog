// Builds a self-contained publishable package in pkg/: only the connector's
// reachable compiled files + a clean package.json (no workspace deps, no
// registry/extra adapters). Publish:
//   pnpm --filter @ai-dialog/gateway pack:publish && cd packages/gateway/pkg && npm publish
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Public npm name (unscoped, matching carono-ai-dialog-widget). Change here if you
// publish under a different name, and update the docs (npx <name>).
const PUBLIC_NAME = 'carono-ai-dialog-connector';
const BIN_NAME = 'ai-dialog-connector';

const root = fileURLToPath(new URL('..', import.meta.url));
const src = JSON.parse(readFileSync(`${root}package.json`, 'utf8'));
const out = `${root}pkg`;

// Only the files reachable from the bin (cli.js → claude-code → context-prompt).
// Everything else (the registry gateway and other adapters) stays out.
rmSync(out, { recursive: true, force: true });
mkdirSync(`${out}/adapters`, { recursive: true });
copyFileSync(`${root}dist/cli.js`, `${out}/cli.js`);
copyFileSync(`${root}dist/adapters/claude-code.js`, `${out}/adapters/claude-code.js`);
copyFileSync(`${root}dist/adapters/context-prompt.js`, `${out}/adapters/context-prompt.js`);

const pkg = {
  name: PUBLIC_NAME,
  version: src.version,
  description:
    'Minimal Claude Code connector for the ai-dialog widget: exposes Claude Code over WebSocket (Agent SDK, cwd = your repo).',
  license: 'MIT',
  type: 'module',
  bin: { [BIN_NAME]: 'cli.js' },
  files: ['cli.js', 'adapters/'],
  engines: { node: '>=18' },
  dependencies: {
    ws: src.dependencies.ws,
    '@anthropic-ai/claude-agent-sdk': src.dependencies['@anthropic-ai/claude-agent-sdk'],
  },
  keywords: ['claude', 'claude-code', 'ai', 'agent', 'widget', 'websocket', 'connector'],
};
writeFileSync(`${out}/package.json`, `${JSON.stringify(pkg, null, 2)}\n`);
writeFileSync(
  `${out}/README.md`,
  `# ${PUBLIC_NAME}\n\nMinimal Claude Code connector for the [ai-dialog](https://github.com/carono/ai-dialog) widget.\n\n` +
    '```bash\n' +
    `npx ${PUBLIC_NAME} --repo /path/to/your/repo --token SECRET\n` +
    '# → listening on ws://127.0.0.1:8787\n' +
    '```\n\n' +
    'The widget then connects with `data-gateway="ws://localhost:8787"`, `data-project`, `data-token`.\n',
);

console.log(`[make-pkg] pkg/ ready: ${pkg.name}@${pkg.version} (bin: ${BIN_NAME})`);
