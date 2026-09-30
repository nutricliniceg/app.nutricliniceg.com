'use client';

import React, { useEffect, forwardRef } from 'react';
import { createPortal } from 'react-dom';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  danger?: boolean;
  children: React.ReactNode;
}

const sizeStyles: Record<string, React.CSSProperties> = {
  sm: { maxWidth: '400px' },
  md: { maxWidth: '560px' },
  lg: { maxWidth: '800px' },
  xl: { maxWidth: '1024px' },
};

export const Modal = forwardRef<HTMLDivElement, ModalProps>(
  ({ open, onClose, size = 'md', danger = false, children }, ref) => {
    useEffect(() => {
      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape') onClose();
      };
      if (open) {
        document.addEventListener('keydown', handleEscape);
        document.body.style.overflow = 'hidden';
      }
      return () => {
        document.removeEventListener('keydown', handleEscape);
        document.body.style.overflow = 'unset';
      };
    }, [open, onClose]);

    if (!open) return null;

    const modalContent = (
      <div
        className="nc-modal-overlay"
        style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '24px',
          animation: 'fadeIn 0.15s ease',
        }}
        onClick={onClose}
      >
        <div
          ref={ref}
          className="nc-modal"
          style={{
            backgroundColor: 'var(--cds-background-01, #ffffff)',
            borderRadius: 'var(--cds-border-radius-03, 8px)',
            boxShadow: 'var(--cds-shadow-04, 0 8px 24px rgba(0,0,0,0.15))',
            width: '100%',
            maxHeight: '90vh',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            ...sizeStyles[size],
            animation: 'slideUp 0.15s ease',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </div>
      </div>
    );

    // Portal to body
    return createPortal(modalContent, document.body);
  }
);

Modal.displayName = 'Modal';

interface ModalHeaderProps {
  children: React.ReactNode;
  style?: React.CSSProperties;
}

export const ModalHeader = ({ children, style = {} }: ModalHeaderProps) => {
  return (
    <div
      className="nc-modal-header"
      style={{
        padding: '16px 24px',
        borderBottom: '1px solid var(--cds-border-subtle-01, #e0e0e0)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        ...style,
      }}
    >
      {children}
    </div>
  );
};

ModalHeader.displayName = 'ModalHeader';

export const ModalHeaderTitle = ({ children, style = {} }: { children: React.ReactNode; style?: React.CSSProperties }) => {
  return (
    <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: 'var(--cds-text-01, #161616)', ...style }}>
      {children}
    </h3>
  );
};

ModalHeaderTitle.displayName = 'ModalHeaderTitle';

interface ModalBodyProps {
  children: React.ReactNode;
  style?: React.CSSProperties;
}

export const ModalBody = ({ children, style = {} }: ModalBodyProps) => {
  return (
    <div
      className="nc-modal-body"
      style={{
        padding: '24px',
        overflowY: 'auto',
        flex: 1,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

ModalBody.displayName = 'ModalBody';

interface ModalFooterProps {
  children: React.ReactNode;
  style?: React.CSSProperties;
}

export const ModalFooter = ({ children, style = {} }: ModalFooterProps) => {
  return (
    <div
      className="nc-modal-footer"
      style={{
        padding: '16px 24px',
        borderTop: '1px solid var(--cds-border-subtle-01, #e0e0e0)',
        display: 'flex',
        justifyContent: 'flex-end',
        gap: '12px',
        ...style,
      }}
    >
      {children}
    </div>
  );
};

ModalFooter.displayName = 'ModalFooter';