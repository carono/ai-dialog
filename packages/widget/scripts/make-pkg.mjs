// Generates a self-contained publishable package in dist/:
// only widget.js + a clean package.json (no runtime dependencies — everything is in the bundle).
// Publishing: cd packages/widget && corepack pnpm pack:publish && cd dist && npm publish --access public
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Public name in npm. Via npm-assets it becomes npm-asset/carono-ai-dialog-widget.
// If you publish under a different name — change it here and in the project's AssetBundle.
const PUBLIC_NAME = 'carono-ai-dialog-widget';

const root = fileURLToPath(new URL('..', import.meta.url));
const src = JSON.parse(readFileSync(`${root}package.json`, 'utf8'));

const pkg = {
  name: PUBLIC_NAME,
  version: src.version,
  description: 'Embeddable AI dialog widget (ai-dialog): sends page context to a configurable endpoint.',
  license: 'MIT',
  main: 'widget.js',
  unpkg: 'widget.js',
  jsdelivr: 'widget.js',
  files: ['widget.js'],
  keywords: ['ai', 'widget', 'chat', 'claude', 'assistant', 'npm-asset'],
};

writeFileSync(`${root}dist/package.json`, `${JSON.stringify(pkg, null, 2)}\n`);
writeFileSync(
  `${root}dist/README.md`,
  `# ${PUBLIC_NAME}\n\nSelf-contained IIFE bundle of the ai-dialog widget.\n\n` +
    '```html\n' +
    `<script\n  src="https://cdn/${PUBLIC_NAME}/widget.js"\n` +
    '  data-project="myapp"\n  data-gateway="wss://your-gateway.example"\n  data-token="a-secret"\n></script>\n' +
    '```\n',
);

console.log(`[make-pkg] dist/ ready to publish: ${pkg.name}@${pkg.version}`);
