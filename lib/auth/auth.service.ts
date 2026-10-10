import { userRepository } from '@/lib/db/repositories/users.repo';
import { authRepository } from '@/lib/db/repositories/auth.repo';
import { auditService } from '@/lib/security/audit';
import { createSessionCookie, destroySession, verifyTokenString } from '@/lib/security/session';
import bcrypt from 'bcrypt';
import { randomInt, randomUUID } from 'crypto';
import { notifyPagedAdmins } from '@/lib/notifications/admin-alerts';
import { sendEmail } from '@/lib/email/mailer';
import { assertPasswordPolicy, getPasswordPolicy, isExpiredByPolicy } from './password-policy';

export interface RegisterData {
  name: string;
  email: string;
  phone: string;
  password: string;
  clinic_name?: string;
  specialization?: string;
}

export interface LoginResult {
  user: {
    id: string;
    email: string;
    name: string;
    role: 'doctor' | 'admin' | 'super_admin';
    is_active: boolean;
  };
  redirectTo: string;
}

export const authService = {
  register: async (data: RegisterData): Promise<string> => {
    const existing = await userRepository.findByEmail(data.email);
    if (existing) {
      throw new Error('EMAIL_EXISTS');
    }

    await assertPasswordPolicy(data.password);
    const passwordHash = await bcrypt.hash(data.password, 12);
    const userId = randomUUID();

    await userRepository.create({
      id: userId,
      email: data.email,
      password_hash: passwordHash,
      name: data.name,
      phone: data.phone,
      clinic_name: data.clinic_name,
      specialization: data.specialization,
      is_active: false,
    });

    await authRepository.logEvent(userId, 'USER_REGISTERED', { email: data.email });

    await notifyPagedAdmins({
      title: 'طبيب جديد في انتظار التفعيل',
      body: `تم تسجيل الطبيب ${data.name} (${data.email}) ويحتاج لتفعيل الحساب.`,
      link: '/admin/users',
      // Historical behaviour: the first failed notify aborts the loop and
      // propagates to the caller (no per-admin catch here).
      isolate: false,
    });

    try {
      await sendEmail({
        to: process.env.ADMIN_EMAIL || 'admin@nutricliniceg.com',
        subject: 'طبيب جديد - يحتاج تفعيل',
        html: `<p>تم تسجيل طبيب جديد:</p><ul><li>الاسم: ${data.name}</li><li>البريد: ${data.email}</li><li>الهاتف: ${data.phone}</li></ul>`,
        text: `طبيب جديد: ${data.name} - ${data.email} - ${data.phone}`,
        fromAlias: 'admin',
      });
    } catch {
      // Log but don't fail registration
    }

    return userId;
  },

  login: async (email: string, password: string): Promise<LoginResult> => {
    const user = await userRepository.findByEmail(email);
    if (!user) {
      await authRepository.logEvent(null, 'LOGIN_FAILED', { email, reason: 'user_not_found' });
      throw new Error('INVALID_CREDENTIALS');
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      await authRepository.logEvent(user.id, 'LOGIN_FAILED', { email, reason: 'invalid_password' });
      throw new Error('INVALID_CREDENTIALS');
    }

    if (!user.is_active) {
      await authRepository.logEvent(user.id, 'LOGIN_FAILED', { email, reason: 'account_inactive' });
      throw new Error('ACCOUNT_INACTIVE');
    }

    if (!user.email_verified) {
      throw new Error('EMAIL_NOT_VERIFIED');
    }

    const policy = await getPasswordPolicy();
    if (isExpiredByPolicy(user.password_changed_at ?? null, policy.expiryDays)) {
      await authRepository.logEvent(user.id, 'LOGIN_FAILED', { email, reason: 'password_expired' });
      throw new Error('PASSWORD_EXPIRED');
    }

    await createSessionCookie({
      sub: user.id,
      role: user.role,
      email: user.email,
    });

    await authRepository.logEvent(user.id, 'LOGIN_SUCCESS', { email });

    let redirectTo = '/dashboard';
    if (user.role === 'admin' || user.role === 'super_admin') {
      redirectTo = '/admin';
    }

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        is_active: user.is_active,
      },
      redirectTo,
    };
  },

  logout: async (token?: string): Promise<void> => {
    if (token) {
      const payload = await verifyTokenString(token);
      if (payload) {
        await authRepository.revokeToken(payload.jti, payload.sub, new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
        await authRepository.logEvent(payload.sub, 'LOGOUT', { jti: payload.jti });
      }
    }
    await destroySession();
  },

  requestPasswordReset: async (email: string): Promise<void> => {
    const user = await userRepository.findByEmail(email);
    if (!user) {
      await authRepository.logEvent(null, 'PASSWORD_RESET_REQUESTED', { email, result: 'user_not_found' });
      return;
    }

    const code = randomInt(100000, 1000000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await authRepository.createCode(user.id, code, expiresAt);
    await authRepository.logEvent(user.id, 'PASSWORD_RESET_REQUESTED', { email });

    try {
      await sendEmail({
        to: user.email,
        subject: 'إعادة تعيين كلمة المرور',
        html: `<p>رمز التحقق الخاص بك: <strong>${code}</strong></p><p>صالح لمدة 10 دقائق.</p>`,
        text: `رمز التحقق: ${code} - صالح لمدة 10 دقائق.`,
        fromAlias: 'no-reply',
      });
    } catch {
      // Log error
    }
  },

  resetPassword: async (email: string, code: string, newPassword: string): Promise<void> => {
    const user = await userRepository.findByEmail(email);
    if (!user) {
      throw new Error('INVALID_CODE');
    }

    const consumed = await authRepository.consumeCode(user.id, code);
    if (!consumed) {
      throw new Error('INVALID_CODE');
    }

    await assertPasswordPolicy(newPassword);
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await userRepository.setPasswordHash(user.id, passwordHash);

    await authRepository.revokeToken('', user.id, new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
    await authRepository.logEvent(user.id, 'PASSWORD_RESET_COMPLETED', { email });

    try {
      await sendEmail({
        to: user.email,
        subject: 'تم تغيير كلمة المرور',
        html: '<p>تم تغيير كلمة المرور بنجاح. إذا لم تطلب هذا التغيير، يرجى التواصل معنا فورًا.</p>',
        text: 'تم تغيير كلمة المرور بنجاح.',
        fromAlias: 'no-reply',
      });
    } catch {
      // Log error
    }
  },

  verifyEmail: async (userId: string, code: string): Promise<boolean> => {
    const user = await userRepository.findById(userId);
    if (!user) return false;

    const consumed = await authRepository.consumeCode(userId, code);
    if (!consumed) return false;

    await userRepository.verifyEmail(userId);
    await authRepository.logEvent(userId, 'EMAIL_VERIFIED', { email: user.email });
    return true;
  },

  changePassword: async (userId: string, currentPassword: string, newPassword: string): Promise<void> => {
    const user = await userRepository.findById(userId);
    if (!user) throw new Error('USER_NOT_FOUND');

    const valid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!valid) throw new Error('INVALID_CURRENT_PASSWORD');

    await assertPasswordPolicy(newPassword);
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await userRepository.setPasswordHash(userId, passwordHash);

    await authRepository.revokeToken('', userId, new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
    await authRepository.logEvent(userId, 'PASSWORD_CHANGED', {});
  },

  revokeAllSessions: async (userId: string): Promise<void> => {
    await authRepository.revokeToken('', userId, new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
    await authRepository.logEvent(userId, 'ALL_SESSIONS_REVOKED', {});
  },

  getProfile: async (userId: string) => {
    return userRepository.findPublicById(userId);
  },
};