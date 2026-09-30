# PR checklist

## What / why
- [ ] PRD requirement IDs cited (e.g. `SEC-11`, `NUT-03`) or N/A with reason

## Quality gates (must all be green)
- [ ] `npm run lint` clean
- [ ] `npm run typecheck` clean
- [ ] `npm test` green (new logic has Vitest coverage)
- [ ] `npm run build` green (bundle/CSS gates pass)

## Security review (QA-06 — required when touching auth / uploads / SQL / AI keys / cookies)
- [ ] No secrets committed (gitleaks green)
- [ ] Zod validation at every touched API boundary
- [ ] No SQL outside `lib/db/repositories/`; only `?` placeholders
- [ ] Foreign-resource access returns generic 404 (never 403)
- [ ] Auth cookies unchanged (HttpOnly + Secure + SameSite=Strict)
- [ ] New file uploads respect whitelist + magic bytes + size caps
- [ ] Audit log entries added for critical events
- [ ] N/A — this PR touches none of the areas above
