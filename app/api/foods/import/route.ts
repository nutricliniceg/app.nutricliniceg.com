import { NextRequest } from 'next/server';
import { ok, fail, unauthorized } from '@/lib/api/response';
import { getRequestMeta } from '@/lib/api/request-meta';
import { checkRateLimit, RATE_LIMITS } from '@/lib/security/rate-limit';
import { verifyTokenFromRequest } from '@/lib/security/session';
import { foodsService } from '@/lib/foods/foods.service';
import { isXlsxMagic, parseImportWorkbook, MAX_IMPORT_BYTES } from '@/lib/foods/excel';
import { auditService } from '@/lib/security/audit';
import { isAdminRole } from '@/lib/security/rbac';
// FL-03/12: Excel import — admin scope=global → public items,
// doctor (or admin scope=mine) → private items owned by the actor.
export async function POST(request: NextRequest) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  const rateLimit = await checkRateLimit(`${payload.sub}:foods:import`, RATE_LIMITS.ai);
  if (!rateLimit.allowed) return fail('RATE_LIMITED', 'Too many requests', 429);
  const admin = isAdminRole(payload.role);
  const { searchParams } = new URL(request.url);
  const scope = searchParams.get('scope') === 'global' && admin ? 'global' : 'mine';

  let file: File | null = null;
  try {
    const form = await request.formData();
    const entry = form.get('file');
    if (entry instanceof File) file = entry;
  } catch {
    return fail('INVALID_FORM', 'Expected multipart form with a file field', 400);
  }
  if (!file) return fail('MISSING_FILE', 'No file uploaded', 400);
  if (file.size > MAX_IMPORT_BYTES) return fail('FILE_TOO_LARGE', 'Excel import limit is 2MB', 413);
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!isXlsxMagic(bytes)) return fail('INVALID_FILE', 'File is not a valid .xlsx workbook', 400);

  let rows;
  try {
    rows = await parseImportWorkbook(bytes);
  } catch (err) {
    const code = (err as Error).message === 'TOO_MANY_ROWS' ? 'TOO_MANY_ROWS' : 'INVALID_FILE';
    return fail(code, code === 'TOO_MANY_ROWS' ? 'Import limit is 1000 rows' : 'Could not parse workbook', 400);
  }
  if (rows.length === 0) return fail('EMPTY_FILE', 'Workbook contains no data rows', 400);

  const report = await foodsService.importRows(payload.sub, rows, scope, admin);
  await auditService.logAction({
    actorId: payload.sub,
    actorRole: payload.role,
    action: 'FOOD_IMPORTED',
    entityType: 'FoodItem',
    req: getRequestMeta(request),
    metadata: { imported: report.imported, rejected: report.rejected.length, skipped: report.skipped.length, scope },
  });
  return ok(report, { message: `Imported ${report.imported} of ${report.total}` }, 201);
}
