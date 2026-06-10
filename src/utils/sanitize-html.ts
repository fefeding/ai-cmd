const ALLOWED_TAGS = new Set([
  'A', 'BR', 'CODE', 'EM', 'H2', 'H3', 'H4', 'LI', 'OL', 'PRE', 'STRONG', 'TABLE', 'TBODY', 'TD', 'TH', 'THEAD', 'TR', 'UL',
]);

const GLOBAL_ALLOWED_ATTRS = new Set(['class']);
const URL_ATTRS = new Set(['href']);

function isSafeUrl(value: string): boolean {
  try {
    const trimmed = value.trim();
    if (!trimmed) return false;
    if (trimmed.startsWith('#') || trimmed.startsWith('/')) return true;
    const parsed = new URL(trimmed, window.location.origin);
    return ['http:', 'https:', 'mailto:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

export function sanitizeHtml(input: string): string {
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') {
    return input.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '');
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${input}</div>`, 'text/html');
  const root = doc.body.firstElementChild as HTMLElement | null;
  if (!root) return '';

  const walk = (node: Node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as HTMLElement;
        if (!ALLOWED_TAGS.has(el.tagName)) {
          el.replaceWith(doc.createTextNode(el.textContent || ''));
          continue;
        }

        for (const attr of Array.from(el.attributes)) {
          const name = attr.name.toLowerCase();
          const value = attr.value;
          if (name.startsWith('on')) {
            el.removeAttribute(attr.name);
            continue;
          }
          if (URL_ATTRS.has(name)) {
            if (!isSafeUrl(value)) {
              el.removeAttribute(attr.name);
              continue;
            }
            if (el.tagName === 'A') {
              el.setAttribute('target', '_blank');
              el.setAttribute('rel', 'noopener noreferrer');
            }
            continue;
          }
          if (!GLOBAL_ALLOWED_ATTRS.has(name) && name !== 'target' && name !== 'rel') {
            el.removeAttribute(attr.name);
          }
        }
        walk(el);
      } else if (child.nodeType === Node.COMMENT_NODE) {
        child.remove();
      }
    }
  };

  walk(root);
  return root.innerHTML;
}

export function escapeHtml(text: string): string {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
