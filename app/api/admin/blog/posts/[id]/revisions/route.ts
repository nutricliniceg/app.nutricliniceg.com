import { NextRequest } from 'next/server';
import { ok, fail, unauthorized, notFound } from '@/lib/api/response';
import { verifyTokenFromRequest } from '@/lib/security/session';
import { postsService } from '@/lib/blog-admin/posts.service';

function denied(role: string) {
  return role !== 'admin' && role !== 'super_admin';
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  if (denied(payload.role)) return fail('NOT_FOUND', 'Not found', 404);
  const { id } = await params;
  const rows = await postsService.revisions(id);
  if (!rows) return notFound();
  return ok({ revisions: rows });
}
