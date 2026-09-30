import { userRepository } from '@/lib/db/repositories/users.repo';
import { adminRepository, type AdminUserFilters } from '@/lib/db/repositories/admin.repo';
import { notificationService } from '@/lib/notifications/service';
import { sendEmail } from '@/lib/email/mailer';
import { fail } from '@/lib/plans';

// ADM-02/03 + ADM-24: user management and the pending-activation queue.
// Emails are best-effort; audit stays with the route layer.
export const adminUsersService = {
  async list(filters: AdminUserFilters) {
    return adminRepository.listUsers(filters);
  },

  async pending(page = 1, limit = 20) {
    return adminRepository.listUsers({ status: 'pending', page, limit });
  },

  async setActive(adminId: string, userId: string, active: boolean) {
    if (adminId === userId) throw fail('FORBIDDEN', 'You cannot change your own status');
    const user = await userRepository.findById(userId);
    if (!user) throw fail('NOT_FOUND', 'User not found');
    await userRepository.update(userId, { is_active: active });
    try {
      await sendEmail({
        to: user.email,
        subject: active ? 'NutriClinicEG: your account is active' : 'NutriClinicEG: your account was deactivated',
        text: active
          ? `Hello ${user.name}, your NutriClinicEG account is now active. You can sign in.`
          : `Hello ${user.name}, your NutriClinicEG account was deactivated. Contact support for help.`,
        html: active
          ? `<p>Hello ${user.name}, your NutriClinicEG account is now <strong>active</strong>.</p>`
          : `<p>Hello ${user.name}, your NutriClinicEG account was <strong>deactivated</strong>.</p>`,
      });
      await notificationService.notify({
        userId, title: active ? 'Account activated' : 'Account deactivated',
        body: active ? 'Your account is now active.' : 'Your account was deactivated.',
        type: 'system',
      });
    } catch {
      // Notification side-channels never fail the action.
    }
    return { id: userId, is_active: active };
  },

  async updateUser(adminId: string, userId: string, patch: { name?: string; phone?: string | null; clinic_name?: string | null; specialization?: string | null }) {
    if (adminId === userId && patch.name === undefined) return { id: userId };
    const user = await userRepository.findById(userId);
    if (!user) throw fail('NOT_FOUND', 'User not found');
    await userRepository.update(userId, patch);
    return { id: userId };
  },

  async adjustSubscription(userId: string, input: { planId?: string | null; addDays?: number; removeDays?: number }) {
    const user = await userRepository.findById(userId);
    if (!user) throw fail('NOT_FOUND', 'User not found');
    const patch: { subscription_plan_id?: string | null; subscription_ends_at?: Date } = {};
    if (input.planId !== undefined) patch.subscription_plan_id = input.planId;
    if (input.addDays !== undefined || input.removeDays !== undefined) {
      const current = user.subscription_ends_at ? new Date(user.subscription_ends_at).getTime() : NaN;
      const base = Number.isFinite(current) && current > Date.now() ? current : Date.now();
      const delta = (input.addDays ?? 0) * 86400000 - (input.removeDays ?? 0) * 86400000;
      patch.subscription_ends_at = new Date(base + delta);
    }
    await userRepository.update(userId, patch);
    try {
      await sendEmail({
        to: user.email,
        subject: 'NutriClinicEG: your subscription was updated',
        text: `Hello ${user.name}, your subscription was updated by support.`,
        html: `<p>Hello ${user.name}, your subscription was updated by support.</p>`,
      });
    } catch {
      // Best-effort only.
    }
    return { id: userId, ...patch };
  },

  async reject(adminId: string, userId: string, reason: string) {
    void adminId;
    const user = await userRepository.findById(userId);
    if (!user || user.role !== 'doctor' || user.is_active) throw fail('NOT_FOUND', 'Pending doctor not found');
    try {
      await sendEmail({
        to: user.email,
        subject: 'NutriClinicEG: account request reviewed',
        text: `Hello ${user.name}, your activation request was not approved. Reason: ${reason}`,
        html: `<p>Hello ${user.name}, your activation request was not approved.</p><p>Reason: ${reason}</p>`,
      });
    } catch {
      // Best-effort only.
    }
    return { id: userId, rejected: true as const };
  },
};
