import { executeQuery } from '@/lib/db/pool';
import { randomUUID } from 'crypto';

// BackupReport persistence + cross-database row-count checksums for SEC-22
// backup verification. Lives here so backup.service.ts holds no SQL (D-01,
// §6.2: all SQL belongs in a repository).

// Fixed allowlist — never derived from user input. Backticked because the
// identifiers are compile-time constants above, not interpolated input.
const CHECKSUM_TABLES = ['User', 'Patient', 'Subscription', 'NewsletterSubscriber', 'BlogPost', 'AuditLog'] as const;

export interface BackupReportInput {
  filePath: string;
  bytes: number;
  offServer: string | null;
  status: string;
  detail: string;
}

export const backupRepository = {
  /** Row count of every checksum table in the given schema. */
  async rowCounts(db: string): Promise<Record<string, number>> {
    const out: Record<string, number> = {};
    for (const table of CHECKSUM_TABLES) {
      try {
        const rows = await executeQuery<Array<{ count: number }>>(
          // eslint-disable-next-line no-restricted-syntax -- db/table are fixed allowlists (D-01)
          `SELECT COUNT(*) as count FROM \`${db}\`.\`${table}\``
        );
        out[table] = Number(rows[0]?.count ?? -1);
      } catch {
        // A table missing in the restored schema must not abort verification;
        // -1 marks it as unmatched so verifyLatest() reports a mismatch.
        out[table] = -1;
      }
    }
    return out;
  },

  async insertReport(input: BackupReportInput): Promise<void> {
    await executeQuery(
      'INSERT INTO BackupReport (id, file_path, bytes, off_server, status, detail) VALUES (?, ?, ?, ?, ?, ?)',
      [randomUUID(), input.filePath, input.bytes, input.offServer, input.status, input.detail]
    );
  },
};

export { CHECKSUM_TABLES };