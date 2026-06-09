import type { SelectedElement } from '@ai-dialog/shared';

/**
 * DevTools-style «element pick» mode: highlight on hover, click locks the selection.
 * The overlay is drawn in the main document (outside the Shadow DOM) to cover the page.
 *
 * @param host  the widget's root node — its elements can't be selected.
 * @returns the stop function (cleanup).
 */
export function startPicker(
  host: Element,
  onPick: (el: SelectedElement) => void,
  onCancel: () => void,
): () => void {
  const box = document.createElement('div');
  Object.assign(box.style, {
    position: 'fixed',
    zIndex: '2147483646',
    pointerEvents: 'none',
    background: 'rgba(31,111,235,.22)',
    border: '2px solid #1f6feb',
    borderRadius: '2px',
    top: '0',
    left: '0',
    width: '0',
    height: '0',
  } as CSSStyleDeclaration);

  const label = document.createElement('div');
  Object.assign(label.style, {
    position: 'fixed',
    zIndex: '2147483646',
    pointerEvents: 'none',
    background: '#0d1117',
    color: '#fff',
    font: '12px ui-monospace, monospace',
    padding: '2px 6px',
    borderRadius: '4px',
    maxWidth: '80vw',
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
  } as CSSStyleDeclaration);

  document.body.append(box, label);
  let current: Element | null = null;

  const onMove = (e: MouseEvent): void => {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    if (!el || el === box || el === label || el === host || host.contains(el)) return;
    current = el;
    const r = el.getBoundingClientRect();
    Object.assign(box.style, {
      top: `${r.top}px`,
      left: `${r.left}px`,
      width: `${r.width}px`,
      height: `${r.height}px`,
    });
    label.textContent = describe(el);
    Object.assign(label.style, {
      top: `${r.top > 24 ? r.top - 22 : r.bottom + 4}px`,
      left: `${r.left}px`,
    });
  };

  const onClick = (e: MouseEvent): void => {
    if (!current) return;
    e.preventDefault();
    e.stopPropagation();
    const picked = build(current);
    cleanup();
    onPick(picked);
  };

  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      cleanup();
      onCancel();
    }
  };

  function cleanup(): void {
    document.removeEventListener('mousemove', onMove, true);
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('keydown', onKey, true);
    box.remove();
    label.remove();
  }

  document.addEventListener('mousemove', onMove, true);
  document.addEventListener('click', onClick, true);
  document.addEventListener('keydown', onKey, true);

  return cleanup;
}

function describe(el: Element): string {
  let s = el.tagName.toLowerCase();
  const id = (el as HTMLElement).id;
  if (id) s += `#${id}`;
  if (el.classList.length) s += `.${Array.from(el.classList).slice(0, 3).join('.')}`;
  return s;
}

function build(el: Element): SelectedElement {
  const r = el.getBoundingClientRect();
  return {
    selector: cssPath(el),
    tag: el.tagName.toLowerCase(),
    id: (el as HTMLElement).id || undefined,
    classes: el.classList.length ? Array.from(el.classList) : undefined,
    text: (el as HTMLElement).innerText?.trim().slice(0, 500) || undefined,
    html: el.outerHTML.slice(0, 1500),
    rect: {
      x: Math.round(r.x),
      y: Math.round(r.y),
      width: Math.round(r.width),
      height: Math.round(r.height),
    },
  };
}

/** Builds a (reasonably) unique CSS path to the element. */
function cssPath(el: Element): string {
  const esc = (s: string): string =>
    typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(s) : s;

  const parts: string[] = [];
  let node: Element | null = el;
  while (node && node.nodeType === 1 && node !== document.body && parts.length < 6) {
    const id = (node as HTMLElement).id;
    if (id) {
      parts.unshift(`#${esc(id)}`);
      break;
    }
    let sel = node.tagName.toLowerCase();
    const parent: Element | null = node.parentElement;
    if (parent) {
      const tag = node.tagName;
      const sameTag = Array.from(parent.children).filter((c) => c.tagName === tag);
      if (sameTag.length > 1) sel += `:nth-of-type(${sameTag.indexOf(node) + 1})`;
    }
    parts.unshift(sel);
    node = node.parentElement;
  }
  return parts.join(' > ');
}
