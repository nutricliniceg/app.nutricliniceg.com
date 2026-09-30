import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { verifyTokenString } from '@/lib/security/session';
import { billingService } from '@/lib/billing/billing.service';
import { receiptStrings, printDir } from '@/lib/print/strings';
import '../../print/print.css';
import PrintButton from '../../print/_components/print-button';

// Printable commercial receipt (white-label aware via clinic branding).
// Tax e-invoicing is OUT of scope (open question Q4): this is a payment
// confirmation, not a tax invoice.
export default async function ReceiptPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ locale?: string }> }) {
  const { id } = await params;
  const query = await searchParams;
  const t = receiptStrings(query.locale);
  let sessionDoctorId: string | null = null;
  let isAdmin = false;
  try {
    const token = (await cookies()).get('nc_session')?.value;
    if (token) {
      const session = await verifyTokenString(token);
      sessionDoctorId = session?.sub ?? null;
      isAdmin = session?.role === 'admin' || session?.role === 'super_admin';
    }
  } catch {
    sessionDoctorId = null;
  }
  if (!sessionDoctorId) notFound();
  let receipt;
  try {
    receipt = await billingService.receipt(id, sessionDoctorId, isAdmin);
  } catch {
    notFound();
  }
  return (
    <div className="print-sheet" dir={printDir(query.locale)}>
      <header className="print-header">
        {receipt.brand.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- print fidelity: plain img prints reliably
          <img src={receipt.brand.logoUrl} alt={receipt.brand.clinicName} />
        )}
        <div>
          <div className="clinic">{receipt.brand.clinicName}</div>
          <div className="doctor">{receipt.brand.doctorName}</div>
        </div>
      </header>
      <div className="print-meta">
        <span>{receipt.user?.name}</span>
        <span>{receipt.user?.email}</span>
      </div>
      <table className="print-table">
        <tbody>
          <tr>
            <td>{t.plan}</td>
            <td>{`${receipt.plan?.name_ar ?? ''} / ${receipt.plan?.name_en ?? ''}`}</td>
          </tr>
          <tr>
            <td>{t.amount}</td>
            <td>{`${receipt.plan?.price_monthly ?? 0} EGP`}</td>
          </tr>
          <tr>
            <td>{t.method}</td>
            <td>{receipt.subscription.payment_method ?? '—'}</td>
          </tr>
          <tr>
            <td>{t.reference}</td>
            <td>{receipt.subscription.payment_reference ?? '—'}</td>
          </tr>
          <tr>
            <td>{t.status}</td>
            <td>{receipt.subscription.status}</td>
          </tr>
        </tbody>
      </table>
      <p className="print-note">{receipt.tax_note}</p>
      <footer className="print-footer">
        <div className="no-print">
          <PrintButton label={t.print} />
        </div>
      </footer>
    </div>
  );
}
