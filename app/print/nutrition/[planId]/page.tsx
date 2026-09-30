import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { verifyTokenString } from '@/lib/security/session';
import { printService } from '@/lib/print/print.service';
import { printStrings, printDir } from '@/lib/print/strings';
import PrintButton from '../../_components/print-button';

// SSR A4 print view (D-11: browser printing only, no server PDF).
// Auth: doctor cookie OR short-lived share ?key=. Renders server-persisted
// values only — rails/reconciled numbers cannot be altered from here.
export default async function NutritionPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ planId: string }>;
  searchParams: Promise<{ key?: string; locale?: string }>;
}) {
  const { planId } = await params;
  const query = await searchParams;
  const locale = query.locale === 'en' ? 'en' : 'ar';
  const t = printStrings(locale);

  let sessionDoctorId: string | null = null;
  try {
    const token = (await cookies()).get('nc_session')?.value;
    if (token) sessionDoctorId = (await verifyTokenString(token))?.sub ?? null;
  } catch {
    sessionDoctorId = null;
  }

  let view;
  try {
    view = await printService.nutrition(planId, sessionDoctorId, query.key);
  } catch {
    notFound();
  }

  return (
    <div dir={printDir(locale)}>
      <header className="print-header">
        {view.brand.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- print fidelity: plain img prints reliably; next/image wrappers break @media print
          <img src={view.brand.logoUrl} alt={view.brand.clinicName} />
        )}
        <div>
          <div className="clinic">{view.brand.clinicName}</div>
          <div className="doctor">{view.brand.doctorName}</div>
        </div>
      </header>
      <div className="print-meta">
        <span>{`${t.patient}: ${view.patientName}`}</span>
        <span>{`${t.targets}: ${view.targets.calories} ${t.kcalUnit}`}</span>
      </div>
      {view.meals.map((meal, i) => (
        <section className="print-day" key={i}>
          <h2>{`${t.day} ${meal.day} — ${meal.mealName}`}</h2>
          <table className="print-table">
            <thead>
              <tr>
                <th>{t.item}</th>
                <th>{t.grams}</th>
                {view.showCalories && <th>{t.calories}</th>}
              </tr>
            </thead>
            <tbody>
              {meal.items.map((item, k) => (
                <tr key={k}>
                  <td>{item.nameAr}</td>
                  <td>{`${item.grams} ${t.gUnit}`}</td>
                  {view.showCalories && <td>{item.calories}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
      <p className="print-note">{t.medicalNote}</p>
      <footer className="print-footer">
        <div>{t.platformFooter}</div>
        <div className="no-print">
          <PrintButton label={t.print} /> <span>{t.pdfHint}</span>
        </div>
      </footer>
    </div>
  );
}
