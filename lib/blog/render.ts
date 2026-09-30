// Server-side blog HTML hygiene. content_html is generated at save-time
// (P26); the public surface re-sanitizes on render: scripts/event handlers
// stripped, iframes limited to YouTube/Vimeo (BLG-39), images lazy (BLG-41).

const ALLOWED_IFRAME_HOSTS = ['www.youtube.com', 'youtube.com', 'youtu.be', 'player.vimeo.com', 'vimeo.com'];

export function sanitizeBlogHtml(html: string): string {
  let out = html.replace(/<script[\s\S]*?<\/script\s*>/gi, '');
  out = out.replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
  out = out.replace(/<iframe\b([^>]*)>([\s\S]*?)<\/iframe\s*>/gi, (match, attrs: string) => {
    const src = /src\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1] ?? '';
    let host = '';
    try {
      host = new URL(src, 'https://x.invalid').hostname;
    } catch {
      return '';
    }
    if (!ALLOWED_IFRAME_HOSTS.includes(host)) return '';
    return `<iframe src="${src}" loading="lazy" allowfullscreen></iframe>`;
  });
  out = out.replace(/<img\b([^>]*?)>/gi, (match, attrs: string) => {
    if (/loading\s*=/i.test(attrs)) return match;
    return `<img${attrs} loading="lazy">`;
  });
  return out;
}

export function readingMinutes(contentMd: string, stored: number | null): number {
  if (stored && stored > 0) return stored;
  const words = contentMd.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

// Give h2-h4 headings the TOC anchors (order-matched with extractToc so
// the rendered TOC links resolve).
export function injectHeadingIds(html: string, anchors: string[]): string {
  let i = 0;
  return html.replace(/<(h[2-4])([^>]*)>([\s\S]*?)<\/\1\s*>/gi, (match, tag: string, attrs: string, inner: string) => {
    if (/id\s*=/i.test(attrs)) return match;
    const anchor = anchors[i];
    i += 1;
    if (!anchor) return match;
    return `<${tag}${attrs} id="${anchor}">${inner}</${tag}>`;
  });
}
