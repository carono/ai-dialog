import type { PageContext } from '@ai-dialog/shared';

/** Limit on the visible text length, to avoid bloating the prompt. */
const VISIBLE_TEXT_LIMIT = 4000;

/**
 * Turns the page context into a text block for the prompt.
 * An agent with repository access uses these "coordinates" to
 * find the corresponding route/component/file on its own.
 */
export function renderContext(ctx: PageContext): string {
  const lines: string[] = [];
  lines.push('<page_context>');
  lines.push(`URL: ${ctx.url}`);
  lines.push(`Route: ${ctx.route}${ctx.hash ? ` (hash: ${ctx.hash})` : ''}`);
  lines.push(`Title: ${ctx.title}`);
  if (ctx.referrer) lines.push(`Referrer: ${ctx.referrer}`);
  lines.push(`Language: ${ctx.lang}`);
  lines.push(`Viewport: ${ctx.viewport.width}x${ctx.viewport.height}`);

  if (ctx.hints?.frameworks.length) {
    lines.push(`Frameworks (heuristic): ${ctx.hints.frameworks.join(', ')}`);
  }
  if (ctx.hints?.markers && Object.keys(ctx.hints.markers).length) {
    lines.push('data-ai-* markers:');
    for (const [k, v] of Object.entries(ctx.hints.markers)) lines.push(`  ${k}: ${v}`);
  }

  const meta = Object.entries(ctx.meta);
  if (meta.length) {
    lines.push('Meta:');
    for (const [k, v] of meta) lines.push(`  ${k}: ${v}`);
  }

  if (ctx.selection) {
    lines.push('User-selected text:');
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
    lines.push('Element picked by the user (inspector) — the question is specifically about it:');
    lines.push(`  selector: ${el.selector}`);
    lines.push(`  tag: <${el.tag}${attrs ? ` ${attrs}` : ''}>`);
    if (el.text) lines.push(`  text: ${truncate(el.text, 500)}`);
    if (el.html) {
      lines.push('  HTML:');
      lines.push(truncate(el.html, 1500));
    }
  }

  if (ctx.errors?.length) {
    lines.push('Page errors:');
    for (const e of ctx.errors.slice(-5)) {
      lines.push(`  - ${e.message}${e.source ? ` @ ${e.source}:${e.line ?? '?'}` : ''}`);
    }
  }

  if (ctx.visibleText) {
    lines.push('Visible page text (slice):');
    lines.push(truncate(ctx.visibleText, VISIBLE_TEXT_LIMIT));
  }

  lines.push('</page_context>');
  return lines.join('\n');
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}… [truncated, ${s.length} chars total]` : s;
}
