import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { mediaRepository } from '@/lib/db/repositories/media.repo';

function mediaDir(): string {
  return process.env.STORAGE_DIR
    ? path.join(process.env.STORAGE_DIR, 'media')
    : path.join(process.cwd(), '.data', 'media');
}

// Public media delivery (blog/CMS images). Long-cacheable immutable files.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const size = new URL(request.url).searchParams.get('size') ?? 'large';
  const row = await mediaRepository.findById(id);
  if (!row) return new NextResponse('Not found', { status: 404 });
  const variants = row.variants ? (JSON.parse(row.variants) as Record<string, string>) : {};
  const file = size !== 'large' && variants[size] ? variants[size] : row.filename;
  if (!file || file.includes('/') || file.includes('..')) return new NextResponse('Not found', { status: 404 });
  try {
    const bytes = await fs.readFile(path.join(mediaDir(), file));
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        'Content-Type': 'image/webp',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch {
    return new NextResponse('Not found', { status: 404 });
  }
}
