import { portalService, PORTAL_INVALID } from '@/lib/portal';
import { generationErrorCode } from '@/lib/errors/fail';
import '../portal.css';
import { WeightForm, NoteForm, MessageForm } from '../_components/portal-forms';
import ThreadSection from '../_components/thread-section';

// NOTE: this page imports the portal context loader (server-side only).
// PP-01 main portal — read-only (PP-12): every change request is a message.
export default async function PatientPortalPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ locale?: string }>;
}) {
  const { token } = await params;
  const query = await searchParams;
  const locale = query.locale === 'en' ? 'en' : 'ar';
  const dir = locale === 'en' ? 'ltr' : 'rtl';
  const t = locale === 'en'
    ? {
        invalid: 'This link is invalid or has expired', hello: 'Hello', today: 'Today',
        nutrition: 'Nutrition plan', exercise: 'Exercise plan', noPlan: 'No active plan yet — your doctor will publish one soon.',
        day: 'Day', item: 'Item', grams: 'g', kcal: 'kcal', sets: 'Sets', reps: 'Reps',
        weightTitle: 'Send weight', weight: 'Weight (kg)', noteOpt: 'Note (optional)', send: 'Send', sent: 'Received — thank you',
        noteTitle: 'Send note', notePh: 'Write your note', msgTitle: 'Message your doctor', msgPh: 'Ask for a change or report something',
        msgHint: 'Anything you write here goes to your doctor as a message — your plan itself never changes from here.',
        attach: 'Attach an image (optional)', attachFailed: 'Image upload failed',
        threadTitle: 'Conversation', you: 'You', doctor: 'Doctor', weightLabel: 'Weight', gUnit: 'g', del: 'Delete', attachment: 'Attachment', emptyThread: 'No messages yet.',
      }
    : {
        invalid: 'هذا الرابط غير صالح أو انتهت صلاحيته', hello: 'أهلاً', today: 'اليوم',
        nutrition: 'خطة التغذية', exercise: 'خطة التمارين', noPlan: 'لا توجد خطة نشطة بعد — سينشر طبيبك واحدة قريبًا.',
        day: 'اليوم', item: 'الصنف', grams: 'جم', kcal: 'سعرة', sets: 'مجموعات', reps: 'تكرارات',
        weightTitle: 'إرسال الوزن', weight: 'الوزن (كجم)', noteOpt: 'ملاحظة (اختياري)', send: 'إرسال', sent: 'تم الاستلام — شكرًا',
        noteTitle: 'إرسال ملاحظة', notePh: 'اكتب ملاحظتك', msgTitle: 'راسل طبيبك', msgPh: 'اطلب تعديلًا أو أبلغ عن شيء',
        msgHint: 'كل ما تكتبه هنا يصل طبيبك كرسالة — خطتك نفسها لا تتغير من هنا أبدًا.',
        attach: 'إرفاق صورة (اختياري)', attachFailed: 'فشل رفع الصورة',
        threadTitle: 'المحادثة', you: 'أنت', doctor: 'الطبيب', weightLabel: 'الوزن', gUnit: 'جم', del: 'حذف', attachment: 'مرفق', emptyThread: 'لا توجد رسائل بعد.',
      };

  let ctx;
  try {
    ctx = await portalService.context(token);
  } catch (err) {
    if (generationErrorCode(err) === PORTAL_INVALID) {
      return (
        <div className="portal-wrap" dir={dir}>
          <div className="portal-error" role="alert">{t.invalid}</div>
        </div>
      );
    }
    throw err;
  }

  const perms = ctx.permissions;
  return (
    <div className="portal-wrap" dir={dir}>
      <h1>{`${t.hello} ${ctx.patientName}`}</h1>
      {perms.view_plans && (
        <>
          <h2>{t.nutrition}</h2>
          {ctx.nutrition ? (
            <div className="portal-card">
              {ctx.nutrition.days.map((day, i) => (
                <div key={i}>
                  <h3>{`${t.day} ${day.day} — ${day.mealName}`}</h3>
                  <table>
                    <tbody>
                      {day.items.map((item, k) => (
                        <tr key={k}>
                          <td>{item.nameAr}</td>
                          <td>{`${item.grams} ${t.grams}`}</td>
                          {ctx.nutrition?.showCalories && <td>{`${item.calories} ${t.kcal}`}</td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          ) : (
            <p>{t.noPlan}</p>
          )}
          <h2>{t.exercise}</h2>
          {ctx.exercise ? (
            <div className="portal-card">
              {ctx.exercise.days.map((day) => (
                <div key={day.day}>
                  <h3>{`${t.day} ${day.day}`}</h3>
                  {day.exercises.map((ex, k) => (
                    <div key={k}>
                      <p>{`${ex.nameAr} — ${ex.sets}×${ex.reps}`}</p>
                      {ex.videoId && (
                        <div className="portal-embed">
                          <iframe src={`https://www.youtube.com/embed/${ex.videoId}`} title={ex.nameAr} allowFullScreen loading="lazy" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <p>{t.noPlan}</p>
          )}
        </>
      )}
      {perms.send_weight && (
        <>
          <h2>{t.weightTitle}</h2>
          <WeightForm token={token} labels={{ weight: t.weight, note: t.noteOpt, send: t.send, sent: t.sent }} />
        </>
      )}
      {perms.send_note && (
        <>
          <h2>{t.noteTitle}</h2>
          <NoteForm token={token} labels={{ text: t.notePh, send: t.send, sent: t.sent }} />
        </>
      )}
      {perms.message && (
        <>
          <h2>{t.msgTitle}</h2>
          <MessageForm token={token} labels={{ text: t.msgPh, send: t.send, sent: t.sent, hint: t.msgHint, attach: t.attach, attachFailed: t.attachFailed }} />
          <ThreadSection token={token} labels={{ title: t.threadTitle, you: t.you, doctor: t.doctor, weight: t.weightLabel, kg: t.gUnit, del: t.del, attachment: t.attachment, empty: t.emptyThread }} />
        </>
      )}
    </div>
  );
}
