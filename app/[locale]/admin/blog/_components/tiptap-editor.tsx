'use client';

import { useEffect, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import TiptapImage from '@tiptap/extension-image';
import TiptapLink from '@tiptap/extension-link';
import { marked } from 'marked';
import TurndownService from 'turndown';
import { cleanPastedHtml } from '@/lib/blog-admin/markdown';
import { VideoEmbed, DirAttribute } from './tiptap-extensions';

const turndown = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-' });

// Lazy-loaded TipTap (BLG-40): imported via next/dynamic(ssr:false) so the
// editor never enters the visitor bundle. Canonical value is Markdown.
export default function TiptapEditor({ valueMd, onMdChange, onSave, onUploadImage }: {
  valueMd: string;
  onMdChange: (md: string) => void;
  onSave: () => void;
  onUploadImage: (file: File) => Promise<string | null>;
}) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit, Underline, DirAttribute, VideoEmbed,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Table.configure({ resizable: false }), TableRow, TableHeader, TableCell,
      TiptapImage, TiptapLink.configure({ openOnClick: false }),
    ],
    content: '',
    onUpdate: ({ editor: e }) => {
      onMdChange(turndown.turndown(e.getHTML()).trim());
    },
    editorProps: {
      handleKeyDown: (view, event) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
          event.preventDefault();
          onSave();
          return true;
        }
        return false;
      },
      handlePaste: (view, event) => {
        const html = event.clipboardData?.getData('text/html');
        if (html) {
          event.preventDefault();
          view.pasteHTML(cleanPastedHtml(html));
          return true;
        }
        return false;
      },
      handleDrop: (view, event) => {
        const file = event.dataTransfer?.files?.[0];
        if (file && file.type.startsWith('image/')) {
          event.preventDefault();
          void onUploadImage(file).then((url) => {
            if (url && editor) editor.chain().focus().setImage({ src: url }).run();
          });
          return true;
        }
        return false;
      },
    },
  });

  // Outside edits (raw-md pane) flow back in when they differ.
  useEffect(() => {
    if (!editor) return;
    const html = marked.parse(valueMd) as string;
    if (html !== editor.getHTML()) editor.commands.setContent(html);
  }, [editor, valueMd]);

  // Floating selection toolbar (BLG-05): follows non-collapsed selections.
  const [sel, setSel] = useState(false);
  useEffect(() => {
    if (!editor) return;
    const update = () => setSel(!editor.state.selection.empty);
    update();
    editor.on('selectionUpdate', update);
    return () => {
      editor.off('selectionUpdate', update);
    };
  }, [editor]);

  if (!editor) return <p>Loading editor…</p>;
  const btn = (label: string, action: () => void, active = false) => (
    <button type="button" onClick={action} style={active ? { fontWeight: 800 } : undefined}>{label}</button>
  );
  return (
    <div>
      <div role="toolbar" aria-label="editor">
        {btn('H2', () => editor.chain().focus().toggleHeading({ level: 2 }).run(), editor.isActive('heading', { level: 2 }))}
        {btn('H3', () => editor.chain().focus().toggleHeading({ level: 3 }).run())}
        {btn('H4', () => editor.chain().focus().toggleHeading({ level: 4 }).run())}
        {btn('B', () => editor.chain().focus().toggleBold().run(), editor.isActive('bold'))}
        {btn('I', () => editor.chain().focus().toggleItalic().run(), editor.isActive('italic'))}
        {btn('U', () => editor.chain().focus().toggleUnderline().run(), editor.isActive('underline'))}
        {btn('•', () => editor.chain().focus().toggleBulletList().run())}
        {btn('1.', () => editor.chain().focus().toggleOrderedList().run())}
        {btn('❝', () => editor.chain().focus().toggleBlockquote().run())}
        {btn('<>', () => editor.chain().focus().toggleCodeBlock().run())}
        {btn('—', () => editor.chain().focus().setHorizontalRule().run())}
        {btn('🔗', () => {
          const url = window.prompt('URL');
          if (url) editor.chain().focus().setLink({ href: url }).run();
        })}
        {btn('▦', () => editor.chain().focus().insertTable({ rows: 3, cols: 3 }).run())}
        {btn('▶', () => {
          const url = window.prompt('YouTube/Vimeo URL');
          if (url) editor.chain().focus().insertContent({ type: 'videoEmbed', attrs: { src: url } }).run();
        })}
        {btn('⇄', () => {
          const cur = editor.getAttributes('paragraph')['data-dir'] ?? editor.getAttributes('heading')['data-dir'];
          const next = cur === 'ltr' ? 'rtl' : 'ltr';
          editor.chain().focus().updateAttributes('paragraph', { 'data-dir': next }).updateAttributes('heading', { 'data-dir': next }).run();
        })}
        {btn('↶', () => editor.chain().focus().undo().run())}
        {btn('↷', () => editor.chain().focus().redo().run())}
      </div>
      {sel && (
        <div role="toolbar" aria-label="selection">
          {btn('B', () => editor.chain().focus().toggleBold().run())}
          {btn('I', () => editor.chain().focus().toggleItalic().run())}
          {btn('🔗', () => {
            const url = window.prompt('URL');
            if (url) editor.chain().focus().setLink({ href: url }).run();
          })}
        </div>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}
