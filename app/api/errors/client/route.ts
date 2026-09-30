import { NextRequest } from 'next/server';
import { ok, fail, failZod } from '@/lib/api/response';
import { verifyTokenFromRequest } from '@/lib/security/session';
import { clientErrorSchema } from '@/lib/errors/errors.schema';
import { errorsService } from '@/lib/errors/errors.service';

export async function POST(request: NextRequest) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) {
    return fail('UNAUTHORIZED', 'Authentication required', 401);
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail('INVALID_JSON', 'Invalid JSON body', 400);
  }
  const parsed = clientErrorSchema.safeParse(body);
  if (!parsed.success) return failZod(parsed.error);
  await errorsService.reportClientError(payload.sub, parsed.data);
  return ok({ message: 'Error reported' }, {}, 202);
}
