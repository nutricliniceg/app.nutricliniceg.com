import { NextRequest, NextResponse } from 'next/server';
import { campaignsRepository } from '@/lib/db/repositories/campaigns.repo';

// NL-22: click-through redirect — counts the click, then 302s to the target.
export async function GET(request: NextRequest) {
  const params = new URL(request.url).searchParams;
  const campaignId = params.get('c');
  const target = params.get('u');
  if (!campaignId || !target || (!target.startsWith('http://') && !target.startsWith('https://'))) {
    return NextResponse.json({ success: false, error: { code: 'NOT_FOUND', message: 'Not found' } }, { status: 404 });
  }
  const campaign = await campaignsRepository.findById(campaignId);
  if (!campaign) {
    return NextResponse.json({ success: false, error: { code: 'NOT_FOUND', message: 'Not found' } }, { status: 404 });
  }
  await campaignsRepository.incrementClicks(campaignId);
  return NextResponse.redirect(target, 302);
}
