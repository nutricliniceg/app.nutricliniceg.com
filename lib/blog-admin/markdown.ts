import { marked } from 'marked';
import TurndownService from 'turndown';

// Canonical storage is Markdown (D-21). The editor works on HTML converted
// at load; saves convert back. marked/turndown are configured to agree on
// the subset the toolbar produces (round-trip tested).

marked.setOptions({ breaks: true });

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
});
turndown.addRule('dirAttrs', {
  filter: (node) => node.nodeName === 'P' && (node as HTMLElement).hasAttribute('data-dir'),
  replacement: (content, node) => `\n\n<div dir="${(node as HTMLElement).getAttribute('data-dir')}">\n\n${content}\n\n</div>\n\n`,
});

export function mdToHtml(markdown: string): string {
  return marked.parse(markdown) as string;
}

export function htmlToMd(html: string): string {
  return turndown.turndown(html).trim();
}

// Smart paste (BLG-06): strip Word/Google-Docs junk, keep structure.
export function cleanPastedHtml(html: string): string {
  let out = html.replace(/<!--[\s\S]*?-->/g, '');
  out = out.replace(/<\/?o:p[^>]*>/gi, '');
  out = out.replace(/\sclass="Mso[^"]*"/gi, '');
  out = out.replace(/\sstyle="[^"]*mso-[^"]*"/gi, (m) => (/font-(family|size)/i.test(m) ? m : ''));
  out = out.replace(/<font\b[^>]*>([\s\S]*?)<\/font\s*>/gi, '$1');
  out = out.replace(/<span\b([^>]*)>([\s\S]*?)<\/span\s*>/gi, (match, attrs: string, inner: string) => {
    if (/style/i.test(attrs) && !/font-(family|size)/i.test(attrs)) return inner;
    if (!/style|dir|lang/i.test(attrs)) return inner;
    return match;
  });
  out = out.replace(/(<\w+[^>]*)\sstyle="\s*"/gi, '$1');
  return out;
}
