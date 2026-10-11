// Stub for `next/cache` when running the seed outside the Next.js runtime.
//
// postsService -> lib/blog/blog.service imports `revalidateTag` from
// `next/cache`, which is a Next server-only API with subpath exports that only
// resolve inside Next's own bundler. Importing it from a plain `node` process
// throws ERR_MODULE_NOT_FOUND.
//
// Tag invalidation is deliberately a no-op here: the staging database is
// seeded *before* the app has ever served those routes, so there is no ISR
// cache entry to purge. If you ever re-seed a database whose blog pages have
// already been generated, follow up with a redeploy (or touch) so Next
// rebuilds those tags — noted in the P32-SEED ledger entry.

export function revalidateTag() {
  // no-op outside Next.js
}

export function revalidatePath() {
  // no-op outside Next.js
}

export function unstable_cache(fn) {
  return fn;
}

export function unstable_noStore() {
  // no-op outside Next.js
}