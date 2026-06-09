// Генерирует самодостаточный публикуемый пакет в dist/:
// только widget.js + чистый package.json (без runtime-зависимостей — всё в бандле).
// Публикация: cd packages/widget && corepack pnpm pack:publish && cd dist && npm publish --access public
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Публичное имя в npm. Через npm-assets станет npm-asset/carono-ai-dialog-widget.
// Если опубликуете под другим именем — поменяйте здесь и в AssetBundle проекта.
const PUBLIC_NAME = 'carono-ai-dialog-widget';

const root = fileURLToPath(new URL('..', import.meta.url));
const src = JSON.parse(readFileSync(`${root}package.json`, 'utf8'));

const pkg = {
  name: PUBLIC_NAME,
  version: src.version,
  description: 'Встраиваемый виджет диалога с AI (ai-dialog): контекст страницы → настраиваемый эндпоинт.',
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
  `# ${PUBLIC_NAME}\n\nСамодостаточный IIFE-бандл виджета ai-dialog.\n\n` +
    '```html\n' +
    `<script\n  src="https://cdn/${PUBLIC_NAME}/widget.js"\n` +
    '  data-project="myapp"\n  data-gateway="wss://ai-gw.example.com"\n  data-token="секрет"\n></script>\n' +
    '```\n',
);

console.log(`[make-pkg] dist/ готов к публикации: ${pkg.name}@${pkg.version}`);
