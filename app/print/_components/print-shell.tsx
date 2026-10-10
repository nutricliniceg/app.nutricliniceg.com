import type { ReactNode } from 'react';
import PrintButton from './print-button';

// Shared chrome for both SSR print views (nutrition + exercise). The pages
// differ only in the body table, so header / meta / note / footer are declared
// once here instead of being copy-pasted per plan type.
//
// No Carbon classes here on purpose: app/print/print.css is the only styling
// source for print, so @media print fidelity is never fought by Carbon CSS.

export interface PrintBrand {
  logoUrl: string | null;
  clinicName: string;
  doctorName: string;
}

export interface PrintShellProps {
  dir: 'rtl' | 'ltr';
  brand: PrintBrand;
  patientName: string;
  /** Extra `print-meta` entries, e.g. the nutrition targets summary. */
  meta?: ReactNode;
  /** The plan-type-specific tables. */
  children: ReactNode;
  strings: {
    day: string;
    medicalNote: string;
    platformFooter: string;
    print: string;
    pdfHint: string;
  };
}

export default function PrintShell({ dir, brand, patientName, meta, children, strings }: PrintShellProps) {
  return (
    <div dir={dir}>
      <header className="print-header">
        {brand.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- print fidelity: plain img prints reliably; next/image wrappers break @media print
          <img src={brand.logoUrl} alt={brand.clinicName} />
        )}
        <div>
          <div className="clinic">{brand.clinicName}</div>
          <div className="doctor">{brand.doctorName}</div>
        </div>
      </header>
      <div className="print-meta">
        <span>{patientName}</span>
        {meta}
      </div>
      {children}
      <p className="print-note">{strings.medicalNote}</p>
      <footer className="print-footer">
        <div>{strings.platformFooter}</div>
        <div className="no-print">
          <PrintButton label={strings.print} /> <span>{strings.pdfHint}</span>
        </div>
      </footer>
    </div>
  );
}