import { describe, it, expect, vi, beforeEach } from 'vitest';
import { userRepository } from '@/lib/db/repositories/users.repo';
import { authRepository } from '@/lib/db/repositories/auth.repo';
import { executeQuery } from '@/lib/db/pool';

vi.mock('@/lib/db/pool');

describe('User Repository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should find user by id', async () => {
    const mockUser = { id: 'user-123', email: 'test@example.com', role: 'doctor' };
    (executeQuery as any).mockResolvedValue([mockUser]);

    const user = await userRepository.findById('user-123');
    expect(user).toEqual(mockUser);
  });

  it('should return null for non-existent user', async () => {
    (executeQuery as any).mockResolvedValue([]);

    const user = await userRepository.findById('non-existent');
    expect(user).toBeNull();
  });

  it('should find user by email', async () => {
    const mockUser = { id: 'user-123', email: 'test@example.com', password_hash: 'hash' };
    (executeQuery as any).mockResolvedValue([mockUser]);

    const user = await userRepository.findByEmail('test@example.com');
    expect(user).toEqual(mockUser);
  });

  it('should create user with correct fields', async () => {
    (executeQuery as any).mockResolvedValue([]);

    await userRepository.create({
      id: 'new-user',
      email: 'new@example.com',
      password_hash: 'hashed',
      name: 'New User',
      phone: '+20123456789',
      role: 'doctor',
      clinic_name: 'Clinic',
      specialization: 'Nutrition',
      preferred_locale: 'ar',
      is_active: false,
    });

    expect(executeQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO User'),
      expect.arrayContaining(['new-user', 'new@example.com', 'hashed', 'New User'])
    );
  });
});

describe('Auth Repository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should revoke token', async () => {
    (executeQuery as any).mockResolvedValue([]);

    await authRepository.revokeToken('jti-123', 'user-123', new Date('2025-01-01'));
    const calls = (executeQuery as any).mock.calls;
    expect(calls[0][0]).toBe('INSERT INTO RevokedToken (jti, user_id, expires_at) VALUES (?, ?, ?)');
    expect(calls[0][1][0]).toBe('jti-123');
    expect(calls[0][1][1]).toBe('user-123');
    expect(calls[0][1][2]).toBeInstanceOf(Date);
  });

  it('should check if token is revoked', async () => {
    (executeQuery as any).mockResolvedValue([{ count: 1 }]);

    const revoked = await authRepository.isTokenRevoked('jti-123');
    expect(revoked).toBe(true);
  });

  it('should return false if token not revoked', async () => {
    (executeQuery as any).mockResolvedValue([{ count: 0 }]);

    const revoked = await authRepository.isTokenRevoked('jti-123');
    expect(revoked).toBe(false);
  });

  it('should create verification code', async () => {
    (executeQuery as any).mockResolvedValue([]);

    await authRepository.createCode('user-123', '123456', new Date('2025-01-01'));
    const calls = (executeQuery as any).mock.calls;
    expect(calls[0][0]).toBe('INSERT INTO VerificationCode (user_id, code, expires_at) VALUES (?, ?, ?)');
    expect(calls[0][1][0]).toBe('user-123');
    expect(calls[0][1][1]).toBe('123456');
    expect(calls[0][1][2]).toBeInstanceOf(Date);
  });

  it('should consume verification code', async () => {
    (executeQuery as any)
      .mockResolvedValueOnce([{ id: 1 }])
      .mockResolvedValueOnce([]);

    const consumed = await authRepository.consumeCode('user-123', '123456');
    expect(consumed).toBe(true);
  });

  it('should return false for invalid code', async () => {
    (executeQuery as any).mockResolvedValue([]);

    const consumed = await authRepository.consumeCode('user-123', 'wrong');
    expect(consumed).toBe(false);
  });

  it('should log audit event', async () => {
    (executeQuery as any).mockResolvedValue([]);

    await authRepository.logEvent('user-123', 'TEST_EVENT', { key: 'value' });
    const calls = (executeQuery as any).mock.calls;
    expect(calls[0][0]).toBe('INSERT INTO AuditLog (actor_id, actor_role, action, entity_type, entity_id, ip_hash, user_agent, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    expect(calls[0][1]).toEqual(['user-123', 'system', 'TEST_EVENT', 'System', null, null, null, '{"key":"value"}']);
  });
});

describe('QATE Errors Repository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('inserts client reports with placeholders and app-side UUID', async () => {
    (executeQuery as any).mockResolvedValue([]);
    const { errorsRepository } = await import('@/lib/db/repositories/errors.repo');

    await errorsRepository.insert({ level: 'error', source: 'client:x', message: 'boom', path: '/p', userId: 'u1' });
    const calls = (executeQuery as any).mock.calls;
    expect(calls[0][0]).toContain('INSERT INTO SystemErrorLog');
    expect(calls[0][0]).not.toContain('UUID()');
    expect(calls[0][1]).toHaveLength(6);
    expect(calls[0][1][1]).toBe('error');
  });
});

describe('QATE Plans Repository visibility flag', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates show_calories_to_patient under ownership guard', async () => {
    (executeQuery as any).mockResolvedValue([]);
    const { plansRepository } = await import('@/lib/db/repositories/plans.repo');

    await plansRepository.updateShowCalories('plan-1', 'doc-1', false);
    const calls = (executeQuery as any).mock.calls;
    expect(calls[0][0]).toBe('UPDATE NutritionPlan SET show_calories_to_patient = ? WHERE id = ? AND doctor_id = ?');
    expect(calls[0][1]).toEqual([false, 'plan-1', 'doc-1']);
  });
});