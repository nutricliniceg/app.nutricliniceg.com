#!/usr/bin/env node
/**
 * Bootstrap the FIRST super_admin account (owner-run, one-shot).
 *
 * WHY A SCRIPT AND NOT /api/setup
 * -------------------------------
 * `/api/setup` returns 404 in production (SEC-01/03) and there is no public
 * "register as admin" route — by design, role escalation must never be
 * reachable over HTTP. This is a local CLI that talks to the database directly
 * using the SAME repository/service code the application uses, so the created
 * account is byte-for-byte identical to one the app would have created.
 *
 * IT REUSES THE PRODUCTION AUTH PIPELINE — nothing is reimplemented:
 *   - password policy : assertPasswordPolicy()  (lib/auth/password-policy.ts)
 *   - hashing         : bcrypt.hash(pw, 12)     (same call as authService.register)
 *   - persistence     : userRepository.create/update/setPasswordHash
 *   - audit           : authRepository.logEvent + auditService.logAction (§6.7 —
 *                       a role grant is a critical event and MUST be audited)
 *
 * It deliberately does NOT call authService.register(), because that path is
 * doctor-specific: it hardcodes role=doctor, sets is_active=false, and fires
 * admin fan-out notifications and a "new doctor pending activation" email —
 * none of which belong in a super_admin bootstrap.
 *
 * SECRET HANDLING (hard requirement)
 * ----------------------------------
 * The email and password are read from the OWNER ONLY:
 *   1. env vars ADMIN_EMAIL / ADMIN_PASSWORD that the owner sets in their own
 *      shell for this one command, or
 *   2. an interactive masked prompt (password echo-suppressed).
 * They are never written to disk, never logged, never echoed, never committed,
 * and never included in any error message. Output is limited to the user id, a
 * MASKED email and the role.
 *
 * IDEMPOTENT: keyed on email. Re-running reconciles role/is_active/
 * email_verified on the existing row and creates nothing. The password is only
 * re-hashed when --reset-password is passed, so a second run cannot silently
 * change a working credential.
 *
 * No schema change. No new npm dependency (bcrypt is already a dependency).
 *
 * Usage (PowerShell):
 *   node --env-file=.env.local --import ./scripts/register-alias.mjs scripts/create-admin.ts
 *   node ... scripts/create-admin.ts --dry                 # validate only, write nothing
 *   node ... scripts/create-admin.ts --reset-password      # also re-hash the password
 *   node ... scripts/create-admin.ts --email x@y.z --name "Owner"
 *
 *   # Non-interactive (owner sets the env vars first):
 *   $env:ADMIN_EMAIL = 'owner@example.com'
 *   $env:ADMIN_PASSWORD = '<the password>'
 *   node --env-file=.env.local --import ./scripts/register-alias.mjs scripts/create-admin.ts
 *   Remove-Item Env:\ADMIN_PASSWORD      # clear it from the session
 */

import { randomUUID } from 'node:crypto';
import bcrypt from 'bcrypt';
import readline from 'node:readline';
import { userRepository } from '@/lib/db/repositories/users.repo';
import { authRepository } from '@/lib/db/repositories/auth.repo';
import { assertPasswordPolicy, getPasswordPolicy } from '@/lib/auth/password-policy';
import { auditService } from '@/lib/security/audit';
// Imported by its real path, not via '@/lib/db/pool': scripts/alias-hook.mjs
// REDIRECTS that specifier to this same module when the CLI runs, so this is the
// identical module instance the repositories use — and it is also the only one
// that type-checks, because the production pool has no closeDbPool().
import { closeDbPool } from './seed-runtime/seed-pool';

// ── args ───────────────────────────────────────────────────────────────────────

/** Set when the account was written but its audit write failed. The account
 *  exists; the process still exits non-zero so the gap is noticed. */
let auditWriteFailed = false;

function parseArgs(argv: string[]): {
  dry: boolean;
  resetPassword: boolean;
  email?: string;
  name?: string;
} {
  const out = { dry: false, resetPassword: false, email: undefined as string | undefined, name: undefined as string | undefined };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry') out.dry = true;
    else if (a === '--reset-password') out.resetPassword = true;
    else if (a === '--email') out.email = argv[++i];
    else if (a === '--name') out.name = argv[++i];
    else if (a === '--help' || a === '-h') {
      console.log(
        'Usage: node --env-file=.env.local --import ./scripts/register-alias.mjs scripts/create-admin.ts [--dry] [--reset-password] [--email <e>] [--name <n>]',
      );
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${a}`);
      process.exit(2);
    }
  }
  return out;
}

// ── secret-safe input ──────────────────────────────────────────────────────────

/** Minimal, dependency-free email shape check (the API boundary uses Zod; this is a local CLI). */
function isEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) && v.length <= 254;
}

/** Echo-suppressed password prompt (Windows/PowerShell friendly). */
function promptHidden(question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    if (!stdin.isTTY) {
      reject(new Error('No TTY available for the masked prompt — set ADMIN_PASSWORD instead.'));
      return;
    }
    const wasRaw = Boolean(stdin.isRaw);
    process.stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let value = '';
    const finish = (ok: boolean) => {
      stdin.removeListener('data', onData);
      stdin.setRawMode(wasRaw);
      stdin.pause();
      process.stdout.write('\n');
      ok ? resolve(value) : reject(new Error('Password entry aborted.'));
    };
    const onData = (ch: string) => {
      if (ch === '\r' || ch === '\n' || ch === '\u0004') return finish(true);
      if (ch === '\u0003') {
        process.stdout.write('\n');
        process.exit(130);
      }
      if (ch === '\u007F' || ch === '\b') {
        if (value.length > 0) {
          value = value.slice(0, -1);
          process.stdout.write('\b \b');
        }
        return;
      }
      if (ch >= ' ') {
        value += ch;
        process.stdout.write('*');
      }
    };
    stdin.on('data', onData);
  });
}

function promptLine(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function resolveInput(args: ReturnType<typeof parseArgs>): Promise<{
  email: string;
  password: string;
  name: string;
}> {
  const email = (args.email ?? process.env.ADMIN_EMAIL ?? (await promptLine('Admin email: '))).trim();
  if (!isEmail(email)) throw new Error('That does not look like a valid email address.');

  const name = (args.name ?? process.env.ADMIN_NAME ?? 'Owner').trim() || 'Owner';

  let password = process.env.ADMIN_PASSWORD ?? '';
  if (!password) {
    password = await promptHidden('Admin password (hidden): ');
    const again = await promptHidden('Confirm password (hidden): ');
    if (password !== again) throw new Error('The two passwords did not match.');
  }
  if (password.length < 8) throw new Error('Password must be at least 8 characters.');

  return { email, password, name };
}

/**
 * Masked email for logs/output: keeps the first character of the local part and
 * the domain, hides everything between. Enough to confirm WHICH account was
 * touched, not enough to be a usable credential in a screenshot.
 */
function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at <= 0) return '***';
  const local = email.slice(0, at);
  const domain = email.slice(at);
  const head = local.slice(0, 1);
  return `${head}${'*'.repeat(Math.max(3, local.length - 1))}${domain}`;
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const { email, password, name } = await resolveInput(args);

  // The production policy check (SEC-20, admin-editable). Run it BEFORE any
  // write so a rejected password never leaves a half-created row.
  await assertPasswordPolicy(password);
  const policy = await getPasswordPolicy();

  console.log('');
  console.log('  target email : ' + maskEmail(email));
  console.log('  role         : super_admin');
  console.log('  policy       : min ' + policy.minLength + ' chars' +
    (policy.requireUpper ? ', upper' : '') +
    (policy.requireDigit ? ', digit' : '') +
    (policy.requireSymbol ? ', symbol' : '') +
    (policy.expiryDays ? `, expires after ${policy.expiryDays}d` : ''));
  console.log('  mode         : ' + (args.dry ? 'DRY RUN (no writes)' : 'WRITE'));

  const existing = await userRepository.findByEmail(email);

  if (existing) {
    console.log('');
    console.log('  existing account found — reconciling (idempotent upsert by email)');

    const changes: Record<string, string | boolean> = {};
    const roleChanged = existing.role !== 'super_admin';
    if (roleChanged) changes.role = 'super_admin';
    if (!existing.is_active) changes.is_active = true;
    if (!existing.email_verified) changes.email_verified = true;
    if (!existing.name) changes.name = name;

    if (Object.keys(changes).length > 0 && !args.dry) {
      // `role` is not in update()'s allowlist (no escalation path in the app),
      // so the promotion goes through the dedicated setRole().
      const { role: _role, ...rest } = changes;
      void _role;
      if (Object.keys(rest).length > 0) await userRepository.update(existing.id, rest);
      if (roleChanged) await userRepository.setRole(existing.id, 'super_admin');
    }

    if (args.resetPassword && !args.dry) {
      await userRepository.setPasswordHash(existing.id, await bcrypt.hash(password, 12));
      console.log('  password re-hashed (--reset-password)');
    } else if (!args.dry) {
      console.log('  password left untouched (pass --reset-password to change it)');
    }

    if (!args.dry) {
      // §6.7 — a role/activation grant is a critical event: audit it. Same
      // rule as the create path: the reconcile has ALREADY been applied, so an
      // audit failure is reported separately and must not be dressed up as
      // "nothing was written".
      try {
        await authRepository.logEvent(existing.id, 'ADMIN_BOOTSTRAP_RECONCILE', {
          email: maskEmail(email),
          changed: Object.keys(changes),
          passwordReset: Boolean(args.resetPassword),
        });
        await auditService.logAction({
          actorId: existing.id,
          actorRole: 'super_admin',
          action: 'ADMIN_BOOTSTRAP_RECONCILE',
          entityType: 'User',
          entityId: existing.id,
          req: { ip: '127.0.0.1', userAgent: 'scripts/create-admin' },
          metadata: { email: maskEmail(email), changed: Object.keys(changes) },
        });
      } catch (err) {
        auditWriteFailed = true;
        console.log('');
        console.log('  *** CHANGES APPLIED, BUT THE AUDIT WRITE FAILED ***');
        console.log('      Audit error: ' + (err instanceof Error ? err.message : String(err)));
      }
    }

    console.log('');
    console.log('  id    : ' + existing.id);
    console.log('  email : ' + maskEmail(email));
    console.log('  role  : super_admin');
    console.log('  ' + (args.dry ? 'DRY RUN — nothing written.' : 'Reconciled.'));
    return;
  }

  if (args.dry) {
    console.log('');
    console.log('  id    : (would be created)');
    console.log('  email : ' + maskEmail(email));
    console.log('  role  : super_admin');
    console.log('');
    console.log('  DRY RUN — nothing written.');
    return;
  }

  // Same hashing the production signup uses: bcrypt, 12 rounds.
  const passwordHash = await bcrypt.hash(password, 12);
  const userId = randomUUID();

  await userRepository.create({
    id: userId,
    email,
    password_hash: passwordHash,
    name,
    phone: null,
    role: 'super_admin',
    clinic_name: null,
    specialization: null,
    preferred_locale: 'ar',
    is_active: true,
  });

  // userRepository.create() always inserts email_verified = FALSE; the login
  // path rejects unverified accounts, so verify immediately after creating.
  await userRepository.verifyEmail(userId);

  // Audit (§6.7) is a hard invariant, but by this point the account ALREADY
  // EXISTS. A failure here must never be reported as a bare "FAILED", because
  // that reads as "nothing was created" and sends the owner hunting for a
  // missing account that is in fact sitting in the database. The account
  // identity is printed first, then any audit problem is called out
  // separately and the process still exits non-zero.
  let auditError: string | null = null;
  try {
    await authRepository.logEvent(userId, 'ADMIN_BOOTSTRAP_CREATE', {
      email: maskEmail(email),
    });
    await auditService.logAction({
      actorId: userId,
      actorRole: 'super_admin',
      action: 'ADMIN_BOOTSTRAP_CREATE',
      entityType: 'User',
      entityId: userId,
      req: { ip: '127.0.0.1', userAgent: 'scripts/create-admin' },
      metadata: { email: maskEmail(email) },
    });
  } catch (err) {
    auditError = err instanceof Error ? err.message : String(err);
  }

  console.log('');
  console.log('  id    : ' + userId);
  console.log('  email : ' + maskEmail(email));
  console.log('  role  : super_admin');
  console.log('');
  if (auditError) {
    console.log('  *** ACCOUNT CREATED, BUT THE AUDIT WRITE FAILED ***');
    console.log('      The account above EXISTS and can sign in at /ar/login.');
    console.log('      Audit error: ' + auditError);
    console.log('');
    auditWriteFailed = true;
    return;
  }
  console.log('  Created. Sign in at /ar/login');
}

main()
  .then(async () => {
    // Close the CLI-only pool so the keep-alive sockets do not hold the
    // process open.
    await closeDbPool().catch(() => undefined);
    // Non-zero when the account exists but its audit write failed: the work is
    // done and usable, but the §6.7 audit trail has a hole that needs attention.
    process.exit(auditWriteFailed ? 3 : 0);
  })
  .catch(async (err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error('');
    console.error('  FAILED: ' + message);
    console.error('');
    await closeDbPool().catch(() => undefined);
    process.exit(1);
  });