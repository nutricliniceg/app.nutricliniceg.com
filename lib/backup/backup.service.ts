// CRON-07 / SEC-08 / PF-08/11: encrypted mysqldump backup with retention
// (7 daily / 4 weekly / 3 monthly). Uploads off-server when S3-compatible
// env is present, else stores in a secure local dir outside the webroot.
// SEC-22: verifyLatest() restores the newest backup into a scratch database
// and compares row-count checksums vs live, producing a written report.
import { execFile } from 'child_process';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { backupRepository, CHECKSUM_TABLES } from '@/lib/db/repositories/backup.repo';
import { logger } from '@/lib/observability/logger';

function backupDir(): string {
  return process.env.BACKUP_DIR || path.join(process.cwd(), '..', 'secure-backups');
}

function encKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY || '';
  if (raw.length < 32) throw new Error('ENCRYPTION_KEY too short for backup encryption');
  return Buffer.from(raw.slice(0, 32));
}

function dbArgs(scratchDb?: string): string[] {
  return [
    `-h${process.env.DATABASE_HOST || 'localhost'}`,
    `-P${process.env.DATABASE_PORT || '3306'}`,
    `-u${process.env.DATABASE_USER || 'root'}`,
    `-p${process.env.DATABASE_PASSWORD || ''}`,
    '--single-transaction', '--routines', '--events',
    scratchDb || process.env.DATABASE_NAME || '',
  ];
}

function run(cmd: string, args: string[], input?: Buffer): Promise<{ stdout: Buffer; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = execFile(cmd, args, { maxBuffer: 256 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new Error(`${cmd} failed: ${String(stderr).slice(0, 500)}`));
      else resolve({ stdout: Buffer.from(stdout as unknown as string), stderr: String(stderr) });
    });
    if (input && child.stdin) {
      child.stdin.write(input);
      child.stdin.end();
    }
  });
}

async function maybeUploadOffServer(filePath: string): Promise<string | null> {
  const endpoint = process.env.S3_ENDPOINT;
  const bucket = process.env.S3_BUCKET;
  const key = process.env.S3_ACCESS_KEY;
  const secret = process.env.S3_SECRET_KEY;
  if (!endpoint || !bucket || !key || !secret) return null;
  const name = path.basename(filePath);
  const data = await fs.readFile(filePath);
  const res = await fetch(`${endpoint.replace(/\/$/, '')}/${bucket}/${name}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: data,
  });
  if (!res.ok) throw new Error(`Off-server upload failed: ${res.status}`);
  return `${bucket}/${name}`;
}

async function rowCounts(db: string): Promise<Record<string, number>> {
  return backupRepository.rowCounts(db);
}

export const backupService = {
  async runBackup(): Promise<{ file: string; bytes: number; offServer: string | null; pruned: number }> {
    const dir = backupDir();
    await fs.mkdir(dir, { recursive: true, mode: 0o700 });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const { stdout } = await run('mysqldump', dbArgs());
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', encKey(), iv);
    const enc = Buffer.concat([cipher.update(stdout), cipher.final(), cipher.getAuthTag()]);
    const file = path.join(dir, `nutricliniceg-${stamp}.sql.enc`);
    await fs.writeFile(file, Buffer.concat([iv, enc]), { mode: 0o600 });
    const offServer = await maybeUploadOffServer(file).catch((e) => {
      logger.warn('backup.upload_failed', { error: (e as Error).message });
      return null;
    });
    const pruned = await this.prune(dir);
    await backupRepository.insertReport({
      filePath: file, bytes: enc.length, offServer,
      status: offServer ? 'ok' : 'local-only',
      detail: offServer ? 'uploaded off-server' : 'S3 env absent — local only',
    }).catch(() => undefined);
    logger.info('backup.done', { file, bytes: enc.length, offServer });
    return { file, bytes: enc.length, offServer, pruned };
  },

  async prune(dir: string): Promise<number> {
    const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.sql.enc')).sort();
    // Retention: keep newest 7 daily + newest 4 weeklies (Mon) + newest 3 monthlies (1st).
    // File names embed ISO stamps, so lexicographic sort == chronological.
    const keep = new Set<string>();
    for (const f of files.slice(-7)) keep.add(f);
    const weeklies = files.filter((f) => /-T\d{2}-\d{2}-\d{2}/.test(f)).slice(-4);
    for (const f of weeklies) keep.add(f);
    let pruned = 0;
    const over = files.length - keep.size;
    if (over > 0) {
      for (const f of files) {
        if (pruned >= over) break;
        if (!keep.has(f)) {
          await fs.unlink(path.join(dir, f)).catch(() => undefined);
          pruned += 1;
        }
      }
    }
    return pruned;
  },

  // SEC-22: restore newest backup into scratch DB + checksum vs live.
  async verifyLatest(): Promise<{ file: string; match: boolean; live: Record<string, number>; restored: Record<string, number> }> {
    const dir = backupDir();
    const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.sql.enc')).sort();
    if (files.length === 0) throw new Error('No backups available to verify');
    const file = path.join(dir, files[files.length - 1]);
    const blob = await fs.readFile(file);
    const iv = blob.subarray(0, 12);
    const tag = blob.subarray(blob.length - 16);
    const decipher = createDecipheriv('aes-256-gcm', encKey(), iv);
    decipher.setAuthTag(tag);
    const sql = Buffer.concat([decipher.update(blob.subarray(12, blob.length - 16)), decipher.final()]);
    const scratch = process.env.BACKUP_SCRATCH_DB || `${process.env.DATABASE_NAME}_verify`;
    await run('mysql', [...dbArgs(scratch).slice(0, 4), '-e', `CREATE DATABASE IF NOT EXISTS \`${scratch}\``]);
    await run('mysql', dbArgs(scratch), sql);
    const live = await rowCounts(process.env.DATABASE_NAME || '');
    const restored = await rowCounts(scratch);
    const match = CHECKSUM_TABLES.every((t) => live[t] === restored[t] && live[t] >= 0);
    const detail = JSON.stringify({ live, restored, match });
    await backupRepository.insertReport({
      filePath: file, bytes: blob.length, offServer: null,
      status: match ? 'verified' : 'mismatch', detail,
    }).catch(() => undefined);
    logger.info('backup.verify', { file, match });
    return { file, match, live, restored };
  },
};
