import { describe, it, expect, vi, beforeEach } from 'vitest';
import { authService } from '@/lib/auth/auth.service';
import { userRepository } from '@/lib/db/repositories/users.repo';
import { authRepository } from '@/lib/db/repositories/auth.repo';
import { auditService } from '@/lib/security/audit';
import { notificationService } from '@/lib/notifications/service';
import { sendEmail } from '@/lib/email/mailer';
import bcrypt from 'bcrypt';

vi.mock('@/lib/db/repositories/users.repo');
vi.mock('@/lib/db/repositories/auth.repo');
vi.mock('@/lib/security/audit');
vi.mock('@/lib/notifications/service');
vi.mock('@/lib/email/mailer');
vi.mock('bcrypt');
vi.mock('crypto', () => ({
  randomUUID: () => 'test-uuid-1234',
}));

describe('Auth Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('register', () => {
    it('should create user and log audit event', async () => {
      (userRepository.findByEmail as any).mockResolvedValue(null);
      (bcrypt.hash as any).mockResolvedValue('hashed-password');
      (userRepository.create as any).mockResolvedValue(undefined);
      (authRepository.logEvent as any).mockResolvedValue(undefined);
      (notificationService.notify as any).mockResolvedValue(undefined);
      (sendEmail as any).mockResolvedValue(undefined);
      (userRepository.listDoctors as any).mockResolvedValue({ users: [], total: 0 });

      const userId = await authService.register({
        name: 'Test Doctor',
        email: 'test@example.com',
        phone: '+20123456789',
        password: 'password123',
        clinic_name: 'Test Clinic',
        specialization: 'Nutrition',
      });

      expect(userId).toBe('test-uuid-1234');
      expect(userRepository.create).toHaveBeenCalledWith(expect.objectContaining({
        id: 'test-uuid-1234',
        email: 'test@example.com',
        name: 'Test Doctor',
        is_active: false,
      }));
      expect(authRepository.logEvent).toHaveBeenCalledWith('test-uuid-1234', 'USER_REGISTERED', { email: 'test@example.com' });
    });

    it('should throw if email exists', async () => {
      (userRepository.findByEmail as any).mockResolvedValue({ id: 'existing' });

      await expect(authService.register({
        name: 'Test',
        email: 'existing@example.com',
        phone: '+20123456789',
        password: 'password123',
      })).rejects.toThrow('EMAIL_EXISTS');
    });
  });

  describe('login', () => {
    it('should succeed with valid credentials', async () => {
      (userRepository.findByEmail as any).mockResolvedValue({
        id: 'user-123',
        email: 'test@example.com',
        password_hash: 'hashed-password',
        name: 'Test Doctor',
        role: 'doctor',
        is_active: true,
        email_verified: true,
      });
      (bcrypt.compare as any).mockResolvedValue(true);

      const result = await authService.login('test@example.com', 'password123');

      expect(result.user.email).toBe('test@example.com');
      expect(result.user.role).toBe('doctor');
      expect(result.redirectTo).toBe('/dashboard');
    });

    it('should fail with invalid password', async () => {
      (userRepository.findByEmail as any).mockResolvedValue({
        id: 'user-123',
        password_hash: 'hashed-password',
      });
      (bcrypt.compare as any).mockResolvedValue(false);

      await expect(authService.login('test@example.com', 'wrong')).rejects.toThrow('INVALID_CREDENTIALS');
      expect(authRepository.logEvent).toHaveBeenCalledWith('user-123', 'LOGIN_FAILED', expect.any(Object));
    });

    it('should fail for inactive account', async () => {
      (userRepository.findByEmail as any).mockResolvedValue({
        id: 'user-123',
        password_hash: 'hashed-password',
        is_active: false,
        email_verified: true,
      });
      (bcrypt.compare as any).mockResolvedValue(true);

      await expect(authService.login('test@example.com', 'password123')).rejects.toThrow('ACCOUNT_INACTIVE');
    });

    it('should fail for unverified email', async () => {
      (userRepository.findByEmail as any).mockResolvedValue({
        id: 'user-123',
        password_hash: 'hashed-password',
        is_active: true,
        email_verified: false,
      });
      (bcrypt.compare as any).mockResolvedValue(true);

      await expect(authService.login('test@example.com', 'password123')).rejects.toThrow('EMAIL_NOT_VERIFIED');
    });
  });

  describe('changePassword', () => {
    it('should update password and revoke sessions', async () => {
      (userRepository.findById as any).mockResolvedValue({
        id: 'user-123',
        password_hash: 'hashed-old',
      });
      (bcrypt.compare as any).mockResolvedValue(true);
      (bcrypt.hash as any).mockResolvedValue('hashed-new');
      (userRepository.setPasswordHash as any).mockResolvedValue(undefined);
      (authRepository.revokeToken as any).mockResolvedValue(undefined);
      (authRepository.logEvent as any).mockResolvedValue(undefined);

      await authService.changePassword('user-123', 'old', 'newpassword123');

      expect(userRepository.setPasswordHash).toHaveBeenCalledWith('user-123', 'hashed-new');
      expect(authRepository.revokeToken).toHaveBeenCalled();
    });

    it('should fail with wrong current password', async () => {
      (userRepository.findById as any).mockResolvedValue({
        id: 'user-123',
        password_hash: 'hashed-old',
      });
      (bcrypt.compare as any).mockResolvedValue(false);

      await expect(authService.changePassword('user-123', 'wrong', 'newpassword123')).rejects.toThrow('INVALID_CURRENT_PASSWORD');
    });
  });
});