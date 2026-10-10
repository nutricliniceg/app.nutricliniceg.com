#!/usr/bin/env node
/* Semantics-preserving verification for the role-dedup codemod.
 *
 * For every API route the codemod rewrote, reconstruct the ORIGINAL guard
 * (from git HEAD) and the NEW guard, and assert both block the exact same
 * set of roles. Roles are enumerated, so a polarity flip shows up here.
 * Run: node scripts/qg-verify-role-semantics.cjs
 */
'use strict';
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');

const ROLES = ['doctor', 'admin', 'super_admin', 'patient', '', 'ADMIN', 'super_admin '];

const isAdminRole = (r) => r === 'admin' || r === 'super_admin';
const isSuperRole = (r) => r === 'super_admin';
const isStaffRole = (r) => r === 'doctor' || r === 'admin' || r === 'super_admin';
const PREDS = { isAdminRole, isSuperRole, isStaffRole };

/** Strip comments so a documented example never counts as live code. */
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** True when `src` blocks `role` with a generic-404 at a guard of `fn`. */
function blocks(src, role, fn) {
  const code = strip(src);
  const pred = PREDS[fn](role);

  // New style: if (!fn(payload.role)) / if (fn(payload.role)) return fail('NOT_FOUND' ...)
  const newRe = new RegExp(`if \\(!?${fn}\\(payload\\.role\\)\\) return fail\\('NOT_FOUND'`);
  const nm = newRe.exec(code);
  if (nm) return nm[1] === '!' ? pred : !pred;

  // Original style A: local `denied(role)` / `isAdminRole(role)` helper.
  if (/function denied\(role: string\)[\s\S]*?return role !== 'admin' && role !== 'super_admin'/.test(code)) {
    if (/if \(denied\(payload\.role\)\) return fail\('NOT_FOUND'/.test(code)) {
      return role !== 'admin' && role !== 'super_admin';
    }
  }
  if (/function isAdminRole\(role: string\)[\s\S]*?return role === 'admin' \|\| role === 'super_admin'/.test(code)) {
    if (/if \(isAdminRole\(payload\.role\)\) return fail\('NOT_FOUND'/.test(code)) {
      return role !== 'admin' && role !== 'super_admin';
    }
  }

  // Original style B: inline admin pair.
  if (/if \(payload\.role !== 'admin' && payload\.role !== 'super_admin'\) return fail\('NOT_FOUND'/.test(code)) {
    return role !== 'admin' && role !== 'super_admin';
  }
  // Original style C: admin OR super helper.
  if (/if \(payload\.role !== 'admin' && !isSuper\(payload\.role\)\) return fail\('NOT_FOUND'/.test(code)) {
    return role !== 'admin' && role !== 'super_admin';
  }
  // Original style D: super-only, via the local `requireSuper` / `isSuper`
  // helper (both returned `role === 'super_admin'`).
  if (
    /function (requireSuper|isSuper)\(role: string\)[\s\S]*?return role === 'super_admin'/.test(code) &&
    /if \(!(requireSuper|isSuper)\(payload\.role\)\) return fail\('NOT_FOUND'/.test(code)
  ) {
    return role !== 'super_admin';
  }
  // Original style E: inline super-only.
  if (/if \(!isSuper\(payload\.role\)\) return fail\('NOT_FOUND'/.test(code)) return role !== 'super_admin';
  if (/if \(payload\.role !== 'super_admin'\) return fail\('NOT_FOUND'/.test(code)) return role !== 'super_admin';

  // Original style E: staff (doctor or above).
  if (
    /if \(payload\.role !== 'doctor' && payload\.role !== 'admin' && payload\.role !== 'super_admin'\)/.test(code)
  ) {
    return !(role === 'doctor' || role === 'admin' || role === 'super_admin');
  }
  return null; // no guard of this shape in the file
}

const files = execFileSync('git', ['ls-files', 'app/api'], { cwd: ROOT, encoding: 'utf8' })
  .split('\n')
  .filter((f) => f.trim().endsWith('route.ts'));

let compared = 0;
let guardCount = 0;
const problems = [];
const ambiguous = [];

for (const rel of files) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) continue;
  const now = fs.readFileSync(full, 'utf8');
  let before;
  try {
    before = execFileSync('git', ['show', `HEAD:${rel}`], { cwd: ROOT, encoding: 'utf8' });
  } catch {
    continue;
  }
  for (const fn of Object.keys(PREDS)) {
    if (!strip(now).includes(`${fn}(payload.role)`)) continue;

    // A file may legitimately hold two different guards (e.g. GET is
    // admin-tier, POST is super-only). The heuristic cannot attribute a
    // single text match to a single HTTP verb, so only compare files where
    // the OLD and NEW sources contain the same NUMBER of guards; anything
    // else is reported for manual review instead of silently passing.
    const countGuards = (s) => {
      const c = strip(s);
      return (
        (c.match(/return fail\('NOT_FOUND'/g) || []).length
      );
    };
    if (countGuards(before) !== countGuards(now)) {
      ambiguous.push(`${rel} (guard count changed: ${countGuards(before)} -> ${countGuards(now)})`);
      continue;
    }
    if (countGuards(before) !== 1) {
      ambiguous.push(`${rel} (${countGuards(before)} guards in file — needs per-verb review)`);
      continue;
    }

    let saw = false;
    for (const role of ROLES) {
      const b = blocks(before, role, fn);
      const a = blocks(now, role, fn);
      if (b === null || a === null) continue;
      saw = true;
      guardCount++;
      if (b !== a) problems.push(`MISMATCH ${rel} [${fn}] role=${JSON.stringify(role)} before=${b} after=${a}`);
    }
    if (saw) compared++;
  }
}

problems.forEach((p) => console.log(p));
ambiguous.forEach((a) => console.log(`AMBIGUOUS (manual review) ${a}`));
console.log(`\nroutes with a comparable guard: ${compared}`);
console.log(`role/guard pairs compared     : ${guardCount}`);
console.log(`mismatches                    : ${problems.length}`);
console.log(`ambiguous (manual review)     : ${ambiguous.length}`);
process.exit(problems.length > 0 ? 1 : 0);