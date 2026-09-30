import { executeQuery } from '@/lib/db/pool';

export interface User {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  phone: string | null;
  role: 'doctor' | 'admin' | 'super_admin';
  clinic_name: string | null;
  clinic_logo_url: string | null;
  specialization: string | null;
  avatar_url: string | null;
  preferred_locale: string;
  is_active: boolean;
  email_verified: boolean;
  email_verified_at: Date | null;
  subscription_plan_id: string | null;
  subscription_ends_at: Date | null;
  trial_ends_at: Date | null;
  password_changed_at: Date | null;
  org_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface UserPublic {
  id: string;
  email: string;
  name: string;
  role: 'doctor' | 'admin' | 'super_admin';
  clinic_name: string | null;
  preferred_locale: string;
  is_active: boolean;
}

export const userRepository = {
  findById: async (id: string): Promise<User | null> => {
    const rows = await executeQuery<User[]>('SELECT * FROM User WHERE id = ?', [id]);
    return rows.length > 0 ? rows[0] : null;
  },

  findByEmail: async (email: string): Promise<User | null> => {
    const rows = await executeQuery<User[]>('SELECT * FROM User WHERE email = ?', [email]);
    return rows.length > 0 ? rows[0] : null;
  },

  findPublicById: async (id: string): Promise<UserPublic | null> => {
    const rows = await executeQuery<UserPublic[]>('SELECT id, email, name, role, clinic_name, preferred_locale, is_active FROM User WHERE id = ?', [id]);
    return rows.length > 0 ? rows[0] : null;
  },

  create: async (data: {
    id: string;
    email: string;
    password_hash: string;
    name: string;
    phone?: string | null;
    role?: 'doctor' | 'admin' | 'super_admin';
    clinic_name?: string | null;
    specialization?: string | null;
    preferred_locale?: string;
    is_active?: boolean;
  }): Promise<void> => {
    await executeQuery(
      `INSERT INTO User (id, email, password_hash, name, phone, role, clinic_name, specialization, preferred_locale, is_active, email_verified)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, FALSE)`,
      [
        data.id,
        data.email,
        data.password_hash,
        data.name,
        data.phone ?? null,
        data.role ?? 'doctor',
        data.clinic_name ?? null,
        data.specialization ?? null,
        data.preferred_locale ?? 'ar',
        data.is_active ?? false,
      ]
    );
  },

  update: async (id: string, data: Partial<Pick<User, 'name' | 'phone' | 'clinic_name' | 'clinic_logo_url' | 'specialization' | 'avatar_url' | 'preferred_locale' | 'is_active' | 'email_verified' | 'subscription_plan_id' | 'subscription_ends_at' | 'trial_ends_at'>>): Promise<void> => {
    const fields: string[] = [];
    const values: Array<string | number | boolean | Date | null> = [];

    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        fields.push(`${key} = ?`);
        values.push(value);
      }
    }

    if (fields.length === 0) return;

    values.push(id);
    // eslint-disable-next-line no-restricted-syntax -- fields are controlled column names, values are parameterized
    await executeQuery(`UPDATE User SET ${fields.join(', ')} WHERE id = ?`, values);
  },

  setPasswordHash: async (id: string, passwordHash: string): Promise<void> => {
    await executeQuery('UPDATE User SET password_hash = ?, password_changed_at = ? WHERE id = ?', [passwordHash, new Date(), id]);
  },

  verifyEmail: async (id: string): Promise<void> => {
    await executeQuery('UPDATE User SET email_verified = TRUE, email_verified_at = NOW() WHERE id = ?', [id]);
  },

  listDoctors: async (page = 1, limit = 20): Promise<{ users: UserPublic[]; total: number }> => {
    const offset = (page - 1) * limit;
    const [users, totalRows] = await Promise.all([
      executeQuery<UserPublic[]>('SELECT id, email, name, role, clinic_name, preferred_locale, is_active FROM User WHERE role = ? ORDER BY created_at DESC LIMIT ? OFFSET ?', ['doctor', limit, offset]),
      executeQuery<{ count: number }[]>('SELECT COUNT(*) as count FROM User WHERE role = ?', ['doctor']),
    ]);
    return { users, total: totalRows[0].count };
  },

  // Bulk-email fan-out source (ADM-18): active users only.
  listAllForBroadcast: async (role: 'doctor' | 'admin' | null): Promise<Array<{ id: string; email: string; name: string; role: string }>> => {
    if (role) {
      return executeQuery<Array<{ id: string; email: string; name: string; role: string }>>(
        'SELECT id, email, name, role FROM User WHERE role = ? AND is_active = TRUE ORDER BY created_at ASC LIMIT 5000',
        [role]
      );
    }
    return executeQuery<Array<{ id: string; email: string; name: string; role: string }>>(
      'SELECT id, email, name, role FROM User WHERE is_active = TRUE ORDER BY created_at ASC LIMIT 5000'
    );
  },
};