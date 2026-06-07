import type { PageContext } from '@ai-dialog/shared';

/** Лимит на длину видимого текста, чтобы не раздувать промпт. */
const VISIBLE_TEXT_LIMIT = 4000;

/**
 * Превращает контекст страницы в текстовый блок для промпта.
 * Агент с доступом к репозиторию использует эти «координаты», чтобы
 * самостоятельно найти соответствующий роут/компонент/файл.
 */
export function renderContext(ctx: PageContext): string {
  const lines: string[] = [];
  lines.push('<page_context>');
  lines.push(`URL: ${ctx.url}`);
  lines.push(`Маршрут: ${ctx.route}${ctx.hash ? ` (hash: ${ctx.hash})` : ''}`);
  lines.push(`Заголовок: ${ctx.title}`);
  if (ctx.referrer) lines.push(`Referrer: ${ctx.referrer}`);
  lines.push(`Язык: ${ctx.lang}`);
  lines.push(`Вьюпорт: ${ctx.viewport.width}x${ctx.viewport.height}`);

  if (ctx.hints?.frameworks.length) {
    lines.push(`Фреймворки (эвристика): ${ctx.hints.frameworks.join(', ')}`);
  }
  if (ctx.hints?.markers && Object.keys(ctx.hints.markers).length) {
    lines.push('Маркеры data-ai-*:');
    for (const [k, v] of Object.entries(ctx.hints.markers)) lines.push(`  ${k}: ${v}`);
  }

  const meta = Object.entries(ctx.meta);
  if (meta.length) {
    lines.push('Meta:');
    for (const [k, v] of meta) lines.push(`  ${k}: ${v}`);
  }

  if (ctx.selection) {
    lines.push('Выделенный пользователем текст:');
    lines.push(truncate(ctx.selection, 1000));
  }

  if (ctx.selectedElement) {
    const el = ctx.selectedElement;
    const attrs = [
      el.id ? `id="${el.id}"` : '',
      el.classes?.length ? `class="${el.classes.join(' ')}"` : '',
    ]
      .filter(Boolean)
      .join(' ');
    lines.push('Выбранный пользователем элемент (инспектор) — спрашивают именно про него:');
    lines.push(`  селектор: ${el.selector}`);
    lines.push(`  тег: <${el.tag}${attrs ? ` ${attrs}` : ''}>`);
    if (el.text) lines.push(`  текст: ${truncate(el.text, 500)}`);
    if (el.html) {
      lines.push('  HTML:');
      lines.push(truncate(el.html, 1500));
    }
  }

  if (ctx.errors?.length) {
    lines.push('Ошибки на странице:');
    for (const e of ctx.errors.slice(-5)) {
      lines.push(`  - ${e.message}${e.source ? ` @ ${e.source}:${e.line ?? '?'}` : ''}`);
    }
  }

  if (ctx.visibleText) {
    lines.push('Видимый текст страницы (срез):');
    lines.push(truncate(ctx.visibleText, VISIBLE_TEXT_LIMIT));
  }

  lines.push('</page_context>');
  return lines.join('\n');
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}… [обрезано, всего ${s.length} симв.]` : s;
}
