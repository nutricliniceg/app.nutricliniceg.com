'use client';

import React from 'react';

interface TagProps {
  children: React.ReactNode;
  kind?: 'default' | 'success' | 'warning' | 'error' | 'info';
  style?: React.CSSProperties;
  className?: string;
}

const kindStyles: Record<string, React.CSSProperties> = {
  default: {
    backgroundColor: 'var(--cds-tag-default-bg, #f4f4f4)',
    color: 'var(--cds-tag-default-text, #161616)',
  },
  success: {
    backgroundColor: 'var(--cds-semantic-green-02, #d1f2eb)',
    color: 'var(--cds-semantic-green-01, #005F73)',
  },
  warning: {
    backgroundColor: 'var(--cds-semantic-yellow-02, #fef3c7)',
    color: 'var(--cds-semantic-yellow-01, #b45309)',
  },
  error: {
    backgroundColor: 'var(--cds-semantic-red-02, #fce4ec)',
    color: 'var(--cds-semantic-red-01, #da1e28)',
  },
  info: {
    backgroundColor: 'var(--cds-semantic-blue-02, #e3f2fd)',
    color: 'var(--cds-semantic-blue-01, #1565c0)',
  },
};

export function Tag({ children, kind = 'default', style = {}, className = '' }: TagProps) {
  return (
    <span
      className={`nc-tag ${className}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 8px',
        borderRadius: 'var(--cds-border-radius-01, 2px)',
        fontSize: '12px',
        fontWeight: 500,
        whiteSpace: 'nowrap',
        ...kindStyles[kind],
        ...style,
      }}
    >
      {children}
    </span>
  );
}