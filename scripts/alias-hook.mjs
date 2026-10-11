// Resolves TypeScript module specifiers for plain `node` execution.
//
// Node 24 strips TypeScript types natively, but it does NOT read tsconfig
// `paths`, and it resolves ESM specifiers strictly (no extension guessing).
// This hook supplies both behaviours the toolchain otherwise provides:
//
//   1. `@/foo`            -> <repo>/foo(.ts|.tsx|/index.ts)   [tsconfig paths]
//   2. `./foo.js`         -> ./foo.ts                        [TS ESM convention]
//   3. `./foo` (no ext)   -> ./foo.ts                        [bundler convention]
//
// Registered via: node --import ./scripts/register-alias.mjs <entry>
import { pathToFileURL, fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ALIAS = '@/';

// Next.js server-only subpath APIs that only resolve inside Next's bundler.
// The seed imports production services that transitively pull these in, so a
// no-op stub keeps the same service code path without requiring a Next server.
//
// `@/lib/db/pool` is redirected to the seed-only pool so the CLI gets its own
// tuned connection settings (connectTimeout, connectionLimit 2) WITHOUT
// changing the pool the running Next.js app uses. See seed-runtime/seed-pool.ts.
const STUBS = new Map([
  ['next/cache', path.join(ROOT, 'scripts/seed-runtime/next-cache-stub.mjs')],
]);

/** Seed-runtime overrides of production modules (only active when seeded). */
const SEED_OVERRIDES = new Map([
  ['@/lib/db/pool', path.join(ROOT, 'scripts/seed-runtime/seed-pool.ts')],
]);

function isFile(p) {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

/** Try the base as-is, then the TS/TSX/index variants. */
function probe(base) {
  // TypeScript's ESM convention: a ".js" specifier means the ".ts" source.
  const withoutExt = base.replace(/\.(js|mjs|cjs)$/, '');
  const candidates = [
    base,
    withoutExt,
    `${withoutExt}.ts`,
    `${withoutExt}.tsx`,
    path.join(withoutExt, 'index.ts'),
    path.join(withoutExt, 'index.tsx'),
  ];
  for (const c of candidates) {
    if (isFile(c)) return c;
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  const stub = STUBS.get(specifier);
  if (stub) return nextResolve(pathToFileURL(stub).href, context);
  const override = SEED_OVERRIDES.get(specifier);
  if (override) return nextResolve(pathToFileURL(override).href, context);
  if (specifier.startsWith(ALIAS)) {
    const abs = probe(path.join(ROOT, specifier.slice(ALIAS.length)));
    if (!abs) throw new Error(`alias-hook: cannot resolve "${specifier}"`);
    return nextResolve(pathToFileURL(abs).href, context);
  }
  if (specifier.startsWith('./') || specifier.startsWith('../')) {
    const parentPath = context.parentURL ? fileURLToPath(context.parentURL) : path.join(ROOT, 'x');
    const abs = probe(path.resolve(path.dirname(parentPath), specifier));
    if (abs) return nextResolve(pathToFileURL(abs).href, context);
  }
  return nextResolve(specifier, context);
}