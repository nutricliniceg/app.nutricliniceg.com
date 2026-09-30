import { NextRequest } from 'next/server';
import { runCronTask } from '@/lib/cron/runner';

// Unified CRON-02 runner: POST /api/cron/[task] with x-cron-secret header.
export async function POST(request: NextRequest, { params }: { params: Promise<{ task: string }> }) {
  const { task } = await params;
  return runCronTask(task, request);
}

export async function GET() {
  const { NextResponse } = await import('next/server');
  return NextResponse.json({ success: false, error: { code: 'NOT_FOUND', message: 'Not found' } }, { status: 404 });
}
