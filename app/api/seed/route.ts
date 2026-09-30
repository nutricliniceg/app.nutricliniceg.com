import { NextResponse } from 'next/server';
import { env } from '@/lib/env';

export async function GET() {
  if (env.NODE_ENV === 'production') {
    return new NextResponse('Not Found', { status: 404 });
  }

  return NextResponse.json({
    status: 'ok',
    message: 'Seed endpoint placeholder (development only)',
  });
}

export async function POST() {
  if (env.NODE_ENV === 'production') {
    return new NextResponse('Not Found', { status: 404 });
  }

  return NextResponse.json({
    status: 'ok',
    message: 'Seed execution placeholder (development only)',
  });
}
