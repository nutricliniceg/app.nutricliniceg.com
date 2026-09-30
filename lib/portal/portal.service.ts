import { randomUUID } from 'crypto';
import { patientRepository } from '@/lib/db/repositories/patients.repo';
import { userRepository } from '@/lib/db/repositories/users.repo';
import { plansRepository } from '@/lib/db/repositories/plans.repo';
import { exercisesRepository } from '@/lib/db/repositories/exercises.repo';
import { portalTokensRepository } from '@/lib/db/repositories/portal-tokens.repo';
import { messagesRepository } from '@/lib/db/repositories/messages.repo';
import { notificationService } from '@/lib/notifications/service';
import { sendEmail } from '@/lib/email/mailer';
import { fail } from '@/lib/plans';
import { round5 } from '@/lib/print';
import { enrichYoutube } from '@/lib/exercises';
import { selfReportsRepository } from '@/lib/db/repositories/self-reports.repo';
import { filesRepository } from '@/lib/db/repositories/files.repo';
import { parsePermissions, hasPermission } from './permissions';
import type { PortalTokenCreateInput, PortalPermissions } from './portal.schema';

export { type PortalPermissions };

// Single generic code for wrong/expired/revoked tokens (PP-10).
export const PORTAL_INVALID = 'PORTAL_INVALID';

function invalid(): Error {
  return fail(PORTAL_INVALID, 'This link is invalid or has expired');
}

interface ResolvedToken {
  tokenId: string;
  patientId: string;
  doctorId: string;
  permissions: PortalPermissions;
}

async function resolve(token: string): Promise<ResolvedToken> {
  const row = await portalTokensRepository.findByToken(token);
  if (!row) throw invalid();
  const revoked = row.revoked === true || row.revoked === 1;
  if (revoked) throw invalid();
  if (new Date(row.expires_at).getTime() <= Date.now()) throw invalid();
  await portalTokensRepository.touchAccess(row.id);
  let permissions: PortalPermissions;
  try {
    permissions = parsePermissions(JSON.parse(String(row.permissions)));
  } catch {
    permissions = parsePermissions(null);
  }
  return { tokenId: row.id, patientId: row.patient_id, doctorId: row.doctor_id, permissions };
}

async function notifyDoctor(doctorId: string, kind: 'weight' | 'note' | 'message', patientName: string): Promise<void> {
  const titles = {
    weight: 'New weight report',
    note: 'New patient note',
    message: 'New patient message',
  } as const;
  await notificationService.notify({
    userId: doctorId,
    title: titles[kind],
    body: `${patientName} sent a ${kind === 'weight' ? 'weight report' : kind}`,
    type: kind === 'message' ? 'new_message' : 'new_report',
  });
  // Best-effort email: a mail failure must never fail the submission.
  try {
    const doctor = await userRepository.findById(doctorId);
    if (doctor?.email) {
      await sendEmail({
        to: doctor.email,
        subject: `NutriClinicEG: ${titles[kind]} — ${patientName}`,
        text: `${titles[kind]} from ${patientName}. Open your inbox to review.`,
        html: `<p>${titles[kind]} from <strong>${patientName}</strong>. Open your inbox to review.</p>`,
      });
    }
  } catch {
    // Email is a notification side-channel only.
  }
}

export const portalService = {
  // ---- doctor side (SET-06) ----
  async createToken(doctorId: string, patientId: string, input: PortalTokenCreateInput): Promise<{ id: string; token: string; url: string; expiresAt: Date }> {
    const patient = await patientRepository.findById(patientId);
    if (!patient || patient.doctor_id !== doctorId) throw fail('NOT_FOUND', 'Patient not found');
    const token = randomUUID();
    const expiresAt = new Date(Date.now() + input.validity_days * 24 * 60 * 60 * 1000);
    const id = await portalTokensRepository.insert({
      patientId, doctorId, token, permissions: input.permissions,
      notifyEmail: input.notify_email ?? null, expiresAt,
    });
    return { id, token, url: `/portal/${token}`, expiresAt };
  },

  async listTokens(doctorId: string, patientId: string) {
    const patient = await patientRepository.findById(patientId);
    if (!patient || patient.doctor_id !== doctorId) return null;
    const rows = await portalTokensRepository.listByPatient(patientId, doctorId);
    return rows.map((r) => ({
      id: r.id, permissions: parsePermissions(JSON.parse(String(r.permissions))),
      expires_at: r.expires_at, revoked: r.revoked === true || r.revoked === 1,
      access_count: Number(r.access_count), last_accessed_at: r.last_accessed_at,
    }));
  },

  async revokeToken(doctorId: string, tokenId: string): Promise<boolean> {
    return portalTokensRepository.revoke(tokenId, doctorId);
  },

  // ---- patient side (PP-01, read-only PP-12) ----
  async context(token: string) {
    const resolved = await resolve(token);
    const patient = await patientRepository.findById(resolved.patientId);
    if (!patient) throw invalid();
    const perms = resolved.permissions;
    let nutrition: {
      planId: string; targets: { calories: number; proteinG: number; carbsG: number; fatsG: number };
      showCalories: boolean;
      days: Array<{ day: number; mealName: string; items: Array<{ nameAr: string; grams: number; calories: number }> }>;
    } | null = null;
    if (hasPermission(perms, 'view_plans')) {
      const plans = await plansRepository.listByPatient(resolved.doctorId, resolved.patientId);
      const active = plans.find((p) => String((p as { status: string }).status) === 'active');
      if (active) {
        const full = await plansRepository.getFullPlan(String((active as { id: string }).id), resolved.doctorId);
        if (full) {
          const p = full.plan as { target_calories: number; target_protein_g: number; target_carbs_g: number; target_fats_g: number; show_calories_to_patient?: boolean | number | null };
          const show = p.show_calories_to_patient == null ? true : p.show_calories_to_patient === true || p.show_calories_to_patient === 1;
          nutrition = {
            planId: String((active as { id: string }).id),
            targets: { calories: Number(p.target_calories), proteinG: Number(p.target_protein_g), carbsG: Number(p.target_carbs_g), fatsG: Number(p.target_fats_g) },
            showCalories: show,
            days: full.meals.map((m) => ({
              day: Number(m.meal.day_of_week),
              mealName: String(m.meal.meal_name),
              items: m.items.map((i) => ({ nameAr: i.food_name_ar, grams: round5(Number(i.grams)), calories: Number(i.calories) })),
            })),
          };
        }
      }
    }
    let exercise: {
      planId: string;
      days: Array<{ day: number; exercises: Array<{ nameAr: string; sets: number; reps: number; videoId: string | null }> }>;
    } | null = null;
    if (hasPermission(perms, 'view_plans')) {
      const plans = await exercisesRepository.listByPatient(resolved.doctorId, resolved.patientId);
      const active = plans.find((p) => p.status === 'active');
      if (active) {
        const full = await exercisesRepository.getFullPlan(active.id, resolved.doctorId);
        if (full) {
          exercise = {
            planId: active.id,
            days: full.days.map((d) => ({
              day: Number(d.day.day_of_week),
              exercises: d.exercises.map((e) => ({
                nameAr: e.name_ar, sets: Number(e.sets), reps: Number(e.reps),
                videoId: enrichYoutube(e.youtube_url).videoId,
              })),
            })),
          };
        }
      }
    }
    const patientName = (patient as { name_ar: string }).name_ar;
    return { patientName, permissions: perms, nutrition, exercise };
  },

  async submitWeight(token: string, weightKg: number, note: string | null) {
    const resolved = await resolve(token);
    if (!hasPermission(resolved.permissions, 'send_weight')) throw fail('PERMISSION_DENIED', 'Weight submission is not enabled for this link');
    const patient = await patientRepository.findById(resolved.patientId);
    if (!patient) throw invalid();
    // Clinical safety: the report lands in the patient file (message
    // thread) for doctor review — current_weight_kg is only updated by the
    // doctor in a visit, never by patient input directly.
    const id = await messagesRepository.insert({
      patientId: resolved.patientId, doctorId: resolved.doctorId, senderType: 'patient',
      messageType: 'weight_log', messageText: note,
      payload: { weight_kg: weightKg, measured_at: new Date().toISOString() },
    });
    // Linked self-report so charts (P10) include patient weights without
    // touching clinical Visit rows.
    await selfReportsRepository.insert({
      patientId: resolved.patientId, doctorId: resolved.doctorId, messageId: id,
      weightKg, measuredAt: new Date(),
    });
    await notifyDoctor(resolved.doctorId, 'weight', (patient as { name_ar: string }).name_ar);
    return { id };
  },

  async submitNote(token: string, text: string) {
    const resolved = await resolve(token);
    if (!hasPermission(resolved.permissions, 'send_note')) throw fail('PERMISSION_DENIED', 'Notes are not enabled for this link');
    const patient = await patientRepository.findById(resolved.patientId);
    if (!patient) throw invalid();
    const id = await messagesRepository.insert({
      patientId: resolved.patientId, doctorId: resolved.doctorId, senderType: 'patient',
      messageType: 'note', messageText: text, payload: null,
    });
    await notifyDoctor(resolved.doctorId, 'note', (patient as { name_ar: string }).name_ar);
    return { id };
  },

  async sendMessage(token: string, text: string, fileId?: string | null) {
    const resolved = await resolve(token);
    if (!hasPermission(resolved.permissions, 'message')) throw fail('PERMISSION_DENIED', 'Messaging is not enabled for this link');
    const patient = await patientRepository.findById(resolved.patientId);
    if (!patient) throw invalid();
    let attachment: string | null = null;
    if (fileId) {
      const file = await filesRepository.findById(fileId);
      if (!file || file.owner_id !== resolved.doctorId) throw fail('NOT_FOUND', 'Attachment not found');
      if (!file.mime.startsWith('image/')) throw fail('INVALID_ATTACHMENT', 'Only images can be attached to messages');
      const linked = (file as { patient_id?: string | null }).patient_id;
      if (linked && linked !== resolved.patientId) throw fail('NOT_FOUND', 'Attachment not found');
      attachment = `file:${file.id}`;
    }
    // PP-12: a change request is a message — plans are never mutated here
    // (this service has no plan-write calls by construction).
    const id = await messagesRepository.insert({
      patientId: resolved.patientId, doctorId: resolved.doctorId, senderType: 'patient',
      messageType: attachment ? 'image' : 'text', messageText: text,
      attachmentUrl: attachment, payload: attachment ? { file_id: fileId } : null,
    });
    await notifyDoctor(resolved.doctorId, 'message', (patient as { name_ar: string }).name_ar);
    return { id };
  },
};
