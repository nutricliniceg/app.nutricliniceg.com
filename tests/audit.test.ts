import { describe, it, expect, vi, beforeEach } from 'vitest';
import { auditService } from '@/lib/security/audit';
import { executeQuery } from '@/lib/db/pool';

vi.mock('@/lib/db/pool');
vi.mock('crypto', () => ({
  createHash: () => ({
    update: vi.fn().mockReturnThis(),
    digest: vi.fn().mockReturnValue('hashed-ip'),
  }),
}));

describe('Audit Service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should log action with hashed IP', async () => {
    (executeQuery as any).mockResolvedValue([]);

    await auditService.logAction({
      actorId: 'user-123',
      actorRole: 'doctor',
      action: 'PATIENT_CREATED',
      entityType: 'Patient',
      entityId: 'patient-456',
      req: { ip: '192.168.1.1', userAgent: 'Mozilla/5.0' },
      metadata: { extra: 'data' },
    });

    expect(executeQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO AuditLog'),
      expect.arrayContaining([
        'user-123',
        'doctor',
        'PATIENT_CREATED',
        'Patient',
        'patient-456',
        'hashed-ip',
        'Mozilla/5.0',
        '{"extra":"data"}',
      ])
    );
  });

  it('should handle missing optional fields', async () => {
    (executeQuery as any).mockResolvedValue([]);

    await auditService.logAction({
      actorId: 'user-123',
      actorRole: 'doctor',
      action: 'LOGIN',
      entityType: 'Session',
      req: { ip: '192.168.1.1', userAgent: 'Mozilla/5.0' },
    });

    expect(executeQuery).toHaveBeenCalled();
  });
});