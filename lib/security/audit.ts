import { createHash } from 'crypto';
import { auditRepository } from '@/lib/db/repositories/audit.repo';

export interface AuditLogEntry {
  actorId: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId?: string;
  req: { ip: string; userAgent: string };
  metadata?: Record<string, unknown>;
}

export const auditService = {
  logAction: async (entry: AuditLogEntry): Promise<void> => {
    const ipHash = createHash('sha256')
      .update(entry.req.ip + (process.env.AUDIT_IP_SALT || 'default-salt-change-in-production'))
      .digest('hex');

    await auditRepository.insert({
      actorId: entry.actorId,
      actorRole: entry.actorRole,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      ipHash,
      userAgent: entry.req.userAgent,
      metadata: entry.metadata,
    });
  },
};
