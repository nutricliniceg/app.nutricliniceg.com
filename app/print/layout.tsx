import './print.css';

// Print layout: minimal chrome for /print/* (UI-16). Intentionally free of
// Carbon components/classes — print.css is the only stylesheet. The root
// layout still wraps this segment (global Carbon base), so all print markup
// is scoped under .print-sheet with explicit styles.
export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return <div className="print-sheet">{children}</div>;
}
