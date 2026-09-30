import { NextRequest, NextResponse } from 'next/server';
import { campaignsService } from '@/lib/newsletter/campaigns.service';

// CRON-11: newsletter batch sender — every 5 minutes, 50/batch (NL-12).
// Auth: x-cron-secret header (CRON-02 unified runner also serves this task
// at POST /api/cron/newsletter-send). Bearer kept for backwards compat.
export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization');
  const headerSecret = request.headers.get('x-cron-secret');
  if (!secret || (auth !== `Bearer ${secret}` && headerSecret !== secret)) {
    return NextResponse.json({ success: false, error: { code: 'NOT_FOUND', message: 'Not found' } }, { status: 404 });
  }
  const result = await campaignsService.processDue();
  return NextResponse.json({ success: true, data: result });
}

export async function GET() {
  return NextResponse.json({ success: false, error: { code: 'NOT_FOUND', message: 'Not found' } }, { status: 404 });
}
