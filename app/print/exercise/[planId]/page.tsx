import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { verifyTokenString } from '@/lib/security/session';
import { printService } from '@/lib/print/print.service';
import { printStrings, printDir } from '@/lib/print/strings';
import PrintShell from '../../_components/print-shell';

export default async function ExercisePrintPage({
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
    view = await printService.exercise(planId, sessionDoctorId, query.key);
  } catch {
    notFound();
  }

  return (
    <PrintShell
      dir={printDir(locale)}
      brand={view.brand}
      patientName={`${t.patient}: ${view.patientName}`}
      strings={t}
    >
      {view.days.map((day) => (
        <section className="print-day" key={day.day}>
          <h2>{`${t.day} ${day.day}`}</h2>
          <table className="print-table">
            <thead>
              <tr>
                <th>{t.item}</th>
                <th>{t.sets}</th>
                <th>{t.reps}</th>
                <th>{t.rest}</th>
                <th>{t.notes}</th>
                <th>{t.video}</th>
              </tr>
            </thead>
            <tbody>
              {day.exercises.map((ex, k) => (
                <tr key={k}>
                  <td>{ex.nameAr}</td>
                  <td>{ex.sets}</td>
                  <td>{ex.reps}</td>
                  <td>{ex.restSeconds ?? '—'}</td>
                  <td>{ex.notes ?? '—'}</td>
                  <td>
                    {ex.youtubeUrl ? (
                      <span>
                        {/* eslint-disable-next-line @next/next/no-img-element -- external YouTube thumbnails are not in next/image remotePatterns; plain img prints reliably */}
                        {ex.thumbnail && <img className="thumb" src={ex.thumbnail} alt={ex.nameAr} />}
                        <a href={ex.youtubeUrl}>{ex.youtubeUrl}</a>
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </PrintShell>
  );
}
