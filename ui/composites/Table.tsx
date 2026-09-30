'use client';

import React, { forwardRef } from 'react';

interface TableContainerProps {
  children: React.ReactNode;
  title?: string;
  style?: React.CSSProperties;
  className?: string;
}

export const TableContainer = forwardRef<HTMLDivElement, TableContainerProps>(
  ({ children, title, style = {}, className = '', ...props }, ref) => {
    return (
      <div ref={ref} className={`nc-table-container ${className}`} style={{ overflowX: 'auto', ...style }} {...props}>
        {title && (
          <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: 600, color: 'var(--cds-text-01, #161616)' }}>
            {title}
          </h3>
        )}
        {children}
      </div>
    );
  }
);

TableContainer.displayName = 'TableContainer';

interface TableProps {
  children: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
}

export const Table = forwardRef<HTMLTableElement, TableProps>(
  ({ children, style = {}, className = '', ...props }, ref) => {
    return (
      <table
        ref={ref}
        className={`nc-table ${className}`}
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: '14px',
          color: 'var(--cds-text-01, #161616)',
          ...style,
        }}
        {...props}
      >
        {children}
      </table>
    );
  }
);

Table.displayName = 'Table';

export const TableHead = forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ children, ...props }, ref) => {
    return (
      <thead ref={ref} {...props}>
        {children}
      </thead>
    );
  }
);

TableHead.displayName = 'TableHead';

export const TableBody = forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ children, ...props }, ref) => {
    return (
      <tbody ref={ref} {...props}>
        {children}
      </tbody>
    );
  }
);

TableBody.displayName = 'TableBody';

export const TableRow = forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ children, style = {}, className = '', ...props }, ref) => {
    return (
      <tr
        ref={ref}
        className={`nc-table-row ${className}`}
        style={{
          borderBottom: '1px solid var(--cds-border-subtle-01, #e0e0e0)',
          ...style,
        }}
        {...props}
      >
        {children}
      </tr>
    );
  }
);

TableRow.displayName = 'TableRow';

interface TableHeaderProps extends React.ThHTMLAttributes<HTMLTableCellElement> {
  scope?: 'col' | 'row';
}

export const TableHeader = forwardRef<HTMLTableCellElement, TableHeaderProps>(
  ({ children, style = {}, className = '', ...props }, ref) => {
    return (
      <th
        ref={ref}
        scope="col"
        className={`nc-table-header ${className}`}
        style={{
          padding: '12px 16px',
          textAlign: 'right',
          fontWeight: 600,
          fontSize: '12px',
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          color: 'var(--cds-text-02, #5a6872)',
          backgroundColor: 'var(--cds-background-02, #f4f4f4)',
          borderBottom: '2px solid var(--cds-border-strong-01, #8d8d8d)',
          ...style,
        }}
        {...props}
      >
        {children}
      </th>
    );
  }
);

TableHeader.displayName = 'TableHeader';

interface TableCellProps extends React.TdHTMLAttributes<HTMLTableCellElement> {}

export const TableCell = forwardRef<HTMLTableCellElement, TableCellProps>(
  ({ children, style = {}, className = '', ...props }, ref) => {
    return (
      <td
        ref={ref}
        className={`nc-table-cell ${className}`}
        style={{
          padding: '12px 16px',
          verticalAlign: 'middle',
          ...style,
        }}
        {...props}
      >
        {children}
      </td>
    );
  }
);

TableCell.displayName = 'TableCell';