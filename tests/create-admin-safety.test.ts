import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SRC = fs.readFileSync(path.join(ROOT, 'scripts/create-admin.ts'), 'utf8');

/** Strip comments only — string literals stay, so assertions can match them. */
function code(): string {
  return SRC.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

/**
 * Strip comments AND string literals, leaving only identifiers. Status messages
 * legitimately contain the word "password" (e.g. "password re-hashed"); what
 * must never appear is the *variable* being passed to output.
 */
function idents(): string {
  return code()
    .replace(/`(?:\\.|[^`\\])*`/g, '``')
    .replace(/"(?:\\.|[^"\\\n])*"/g, '""')
    .replace(/'(?:\\.|[^'\\\n])*'/g, "''");
}

describe('create-admin: secret handling', () => {
  it('never prints the password', () => {
    const c = idents();
    // No output statement may reference the password variable directly.
    expect(c).not.toMatch(/console\.(log|error|warn|info)\([^)]*\bpassword\b/i);
    expect(c).not.toMatch(/JSON\.stringify\([^)]*\bpassword\b/i);
    expect(c).not.toMatch(/process\.(stdout|stderr)\.write\([^)]*\bpassword\b/i);
  });

  it('never writes credentials to disk', () => {
    const c = code();
    expect(c).not.toMatch(/writeFile|appendFile|createWriteStream/);
  });

  it('reads credentials from the owner only (env or masked prompt)', () => {
    const c = code();
    expect(c).toMatch(/process\.env\.ADMIN_PASSWORD/);
    expect(c).toMatch(/process\.env\.ADMIN_EMAIL/);
    // The interactive path must suppress echo.
    expect(c).toMatch(/setRawMode\(true\)/);
    expect(c).toMatch(/promptHidden/);
    // Password is confirmed twice so a typo cannot lock the owner out.
    expect(c).toMatch(/Confirm password/);
  });

  it('masks the email in every user-facing output', () => {
    const c = idents();
    expect(c).toMatch(/function maskEmail/);
    // The raw email must never be echoed; only maskEmail(email) may be.
    expect(c).not.toMatch(/console\.(log|error|warn|info)\([^)]*\+ email\b/);
    expect(c).not.toMatch(/console\.(log|error|warn|info)\([^)]*\$\{email\}/);
    expect(code()).toMatch(/maskEmail\(email\)/);
  });
});

describe('create-admin: uses the production auth pipeline', () => {
  it('applies the real password policy and bcrypt cost 12', () => {
    const c = code();
    expect(c).toMatch(/await assertPasswordPolicy\(password\)/);
    expect(c).toMatch(/bcrypt\.hash\(password, 12\)/);
  });

  it('writes through the repository layer, never raw SQL', () => {
    const c = idents();
    expect(c).toMatch(/userRepository\.create/);
    expect(c).not.toMatch(/INSERT INTO/i);
    expect(c).not.toMatch(/UPDATE User SET/i);
    expect(c).not.toMatch(/executeQuery/);
  });

  it('does not reuse doctor-specific authService.register', () => {
    // register() hardcodes role=doctor, is_active=false and fires admin
    // fan-out + a "new doctor pending activation" email.
    expect(idents()).not.toMatch(/authService\.register/);
  });

  it('verifies the email, because create() always inserts FALSE', () => {
    expect(code()).toMatch(/userRepository\.verifyEmail\(userId\)/);
  });
});

describe('create-admin: role escalation stays narrow', () => {
  it('promotes through the dedicated setRole(), never a widened update()', () => {
    expect(code()).toMatch(/userRepository\.setRole\(existing\.id, 'super_admin'\)/);
  });

  it('users.repo.update() still cannot write the role column', () => {
    const repo = fs.readFileSync(
      path.join(ROOT, 'lib/db/repositories/users.repo.ts'),
      'utf8',
    );
    const sig = /update: async \(id: string, data: Partial<Pick<User,([^>]*)>>\)/.exec(repo);
    expect(sig, 'could not find the update() signature').not.toBeNull();
    expect(sig![1]).not.toMatch(/'role'/);
    // ...but the dedicated, explicitly-typed setter exists.
    expect(repo).toMatch(/setRole: async \(id: string, role: 'doctor' \| 'admin' \| 'super_admin'\)/);
    // ...and it is parameterized (D-01: no string interpolation).
    expect(repo).toMatch(/UPDATE User SET role = \? WHERE id = \?/);
  });
});

describe('create-admin: idempotency', () => {
  it('keys the upsert on email and never duplicates', () => {
    const c = code();
    expect(c).toMatch(/userRepository\.findByEmail\(email\)/);
    // Create happens only in the not-found branch.
    expect(c).not.toMatch(/userRepository\.create\([^)]*findByEmail/);
  });

  it('only re-hashes the password when explicitly asked', () => {
    const c = code();
    expect(c).toMatch(/setPasswordHash[\s\S]*args\.resetPassword/);
    expect(c).toMatch(/args\.resetPassword/);
  });

  it('supports a dry run that writes nothing', () => {
    const c = code();
    expect(c).toMatch(/--dry/);
    expect(c).toMatch(/args\.dry/);
  });
});

describe('create-admin: critical events are audited', () => {
  it('logs both the create and reconcile paths (§6.7)', () => {
    const c = code();
    expect(c).toMatch(/authRepository\.logEvent\(userId, 'ADMIN_BOOTSTRAP_CREATE'/);
    expect(c).toMatch(/authRepository\.logEvent\(existing\.id, 'ADMIN_BOOTSTRAP_RECONCILE'/);
    expect(c).toMatch(/auditService\.logAction/);
    // Audit metadata must never carry the plaintext email or password.
    expect(c).not.toMatch(/metadata: \{[^}]*email: email\b/);
  });
});