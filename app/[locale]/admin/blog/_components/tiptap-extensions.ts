import { Node, mergeAttributes } from '@tiptap/core';

// YouTube/Vimeo embed node (BLG-01 video): parses whitelisted iframes,
// renders them back identically so markdown round-trips keep videos.
export const VideoEmbed = Node.create({
  name: 'videoEmbed',
  group: 'block',
  atom: true,
  addAttributes() {
    return { src: { default: null } };
  },
  parseHTML() {
    return [{
      tag: 'iframe',
      getAttrs: (node) => {
        const el = node as HTMLElement;
        const src = el.getAttribute('src') ?? '';
        if (/^(https:\/\/(www\.youtube\.com\/embed\/|youtu\.be\/|player\.vimeo\.com\/video\/|vimeo\.com\/))/.test(src)) {
          return { src };
        }
        return false;
      },
    }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['iframe', mergeAttributes(HTMLAttributes, { loading: 'lazy', allowfullscreen: 'true' })];
  },
});

// Per-block direction (BLG-02): data-dir on paragraphs/headings,
// toggled from the toolbar; CSS in the editor shell honors it.
const BLOCKS = ['paragraph', 'heading'];

export const DirAttribute = Node.create({
  name: 'dirAttribute',
  addGlobalAttributes() {
    return BLOCKS.map((type) => ({
      types: [type],
      attributes: {
        'data-dir': {
          default: null,
          parseHTML: (el) => (el as HTMLElement).getAttribute('data-dir'),
          renderHTML: (attrs) => (attrs['data-dir'] ? { 'data-dir': attrs['data-dir'] } : {}),
        },
      },
    }));
  },
});
