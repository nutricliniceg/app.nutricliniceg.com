'use client';

import React, { forwardRef } from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  kind?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ReactNode;
  iconPosition?: 'left' | 'right';
  loading?: boolean;
}

const kindStyles: Record<string, React.CSSProperties> = {
  primary: {
    backgroundColor: 'var(--cds-button-primary-01, #008080)',
    color: 'var(--cds-button-primary-text, #ffffff)',
    border: 'none',
  },
  secondary: {
    backgroundColor: 'var(--cds-button-secondary-01, #f4f4f4)',
    color: 'var(--cds-button-secondary-text, #161616)',
    border: '1px solid var(--cds-border-strong-01, #8d8d8d)',
  },
  ghost: {
    backgroundColor: 'transparent',
    color: 'var(--cds-button-primary-01, #008080)',
    border: 'none',
  },
  danger: {
    backgroundColor: 'var(--cds-semantic-red-01, #da1e28)',
    color: '#ffffff',
    border: 'none',
  },
};

const sizeStyles: Record<string, React.CSSProperties> = {
  sm: { padding: '4px 12px', fontSize: '12px', height: '32px' },
  md: { padding: '8px 16px', fontSize: '14px', height: '40px' },
  lg: { padding: '12px 24px', fontSize: '16px', height: '48px' },
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      kind = 'primary',
      size = 'md',
      icon,
      iconPosition = 'left',
      loading = false,
      disabled,
      children,
      style = {},
      className = '',
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || loading;

    return (
      <button
        ref={ref}
        disabled={isDisabled}
        className={`nc-button ${className}`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          borderRadius: 'var(--cds-border-radius-02, 4px)',
          fontWeight: 500,
          cursor: isDisabled ? 'not-allowed' : 'pointer',
          opacity: isDisabled ? 0.5 : 1,
          transition: 'all 0.15s ease',
          ...kindStyles[kind],
          ...sizeStyles[size],
          ...style,
        }}
        {...props}
      >
        {loading && (
          <svg
            style={{ width: '16px', height: '16px', animation: 'spin 1s linear infinite' }}
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <circle
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray="31.4 31.4"
            />
          </svg>
        )}
        {icon && iconPosition === 'left' && !loading && <span style={{ display: 'flex' }}>{icon}</span>}
        <span>{children}</span>
        {icon && iconPosition === 'right' && !loading && <span style={{ display: 'flex' }}>{icon}</span>}
      </button>
    );
  }
);

Button.displayName = 'Button';