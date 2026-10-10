import { NextRequest } from 'next/server';
import { notFound } from '@/lib/api/response';
import { runCronTask } from '@/lib/cron/runner';

// Unified CRON-02 runner: POST /api/cron/[task] with x-cron-secret header.
// GET is 404 so the cron surface is never enumerable (hard invariant #1).
export async function POST(request: NextRequest, { params }: { params: Promise<{ task: string }> }) {
  const { task } = await params;
  return runCronTask(task, request);
}

export async function GET() {
  return notFound('Not found');
}
