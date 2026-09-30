'use client';

import { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import DOMPurify from 'dompurify';

// Markdown rendering for AI output: react-markdown (no raw HTML) +
// DOMPurify belt-and-braces on the serialized output.
export default function SafeMarkdown({ text }: { text: string }) {
  const clean = useMemo(() => DOMPurify.sanitize(text), [text]);
  return <ReactMarkdown>{clean}</ReactMarkdown>;
}
