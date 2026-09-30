import { NextRequest, NextResponse } from 'next/server';

// D-04: /p/[token] is a short alias → 301 to the canonical portal route.
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const url = new URL(`/portal/${token}`, request.url);
  const locale = new URL(request.url).searchParams.get('locale');
  if (locale === 'en' || locale === 'ar') url.searchParams.set('locale', locale);
  return NextResponse.redirect(url, 301);
}
