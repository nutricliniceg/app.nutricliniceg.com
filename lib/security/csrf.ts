// CSRF Origin check extracted for unit-testing (used by middleware.ts).
// Requests without an Origin header (curl, server-to-server, same-origin
// form posts without Origin) pass; a present-but-foreign Origin fails.
export function isOriginAllowed(origin: string | null, host: string | null): boolean {
  if (!origin || !host) return true;
  try {
    const originHost = new URL(origin).host;
    return originHost === host || origin.endsWith(`://${host}`) || originHost.endsWith(`.${host}`);
  } catch {
    return false;
  }
}
