import { NextRequest } from 'next/server';
import { reviewDraft } from '../shared';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, { params }: Ctx) {
  const { id } = await params;
  return reviewDraft(request, id, 'discarded');
}
