'use client';

import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export function Card({ children, className = '', style = {} }: CardProps) {
  return (
    <div
      className={`nc-card ${className}`}
      style={{
        backgroundColor: 'var(--cds-background-01, #ffffff)',
        border: '1px solid var(--cds-border-subtle-01, #e0e0e0)',
        borderRadius: 'var(--cds-border-radius-03, 8px)',
        boxShadow: 'var(--cds-shadow-01, 0 1px 3px rgba(0,0,0,0.1))',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className = '', style = {} }: CardProps) {
  return (
    <div
      className={`nc-card-header ${className}`}
      style={{
        padding: 'var(--cds-spacing-06, 24px) var(--cds-spacing-06, 24px) var(--cds-spacing-04, 16px)',
        borderBottom: '1px solid var(--cds-border-subtle-01, #e0e0e0)',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function CardBody({ children, className = '', style = {} }: CardProps) {
  return (
    <div
      className={`nc-card-body ${className}`}
      style={{
        padding: 'var(--cds-spacing-06, 24px)',
        ...style,
      }}
    >
      {children}
    </div>
  );
}