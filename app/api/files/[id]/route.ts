import { NextRequest, NextResponse } from 'next/server';
import { fail } from '@/lib/api/response';
import { filesService, uploadErrorCode } from '@/lib/files/files.service';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const token = new URL(request.url).searchParams.get('token');
  if (!token) return fail('INVALID_LINK', 'Download link is invalid or expired', 403);
  try {
    const { bytes, mime, filename } = await filesService.download(id, token);
    return new NextResponse(bytes as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': mime,
        'Content-Disposition': `attachment; filename="${filename.replace(/"/g, '')}"`,
        'Cache-Control': 'private, max-age=60',
      },
    });
  } catch (err) {
    const code = uploadErrorCode(err);
    const status = code === 'NOT_FOUND' ? 404 : 403;
    return fail(code, err instanceof Error ? err.message : 'Download failed', status);
  }
}
