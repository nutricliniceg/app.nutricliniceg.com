import { NextRequest, NextResponse } from 'next/server';
import { notFound } from '@/lib/api/response';
import { campaignsRepository } from '@/lib/db/repositories/campaigns.repo';

// NL-22: click-through redirect — counts the click, then 302s to the target.
// Only absolute http(s) targets are accepted, so `u` can never become a
// javascript:/data: open-redirect from a crafted link.
export async function GET(request: NextRequest) {
  const params = new URL(request.url).searchParams;
  const campaignId = params.get('c');
  const target = params.get('u');
  if (!campaignId || !target || (!target.startsWith('http://') && !target.startsWith('https://'))) {
    return notFound('Not found');
  }
  const campaign = await campaignsRepository.findById(campaignId);
  if (!campaign) {
    return notFound('Not found');
  }
  await campaignsRepository.incrementClicks(campaignId);
  return NextResponse.redirect(target, 302);
}
