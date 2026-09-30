import { NextRequest, NextResponse } from 'next/server';
import { unauthorized } from '@/lib/api/response';
import { verifyTokenFromRequest } from '@/lib/security/session';
import { buildTemplateWorkbook } from '@/lib/foods/excel';

// FL-03: downloadable sample template for the Excel import.
export async function GET(request: NextRequest) {
  const payload = await verifyTokenFromRequest(request);
  if (!payload) return unauthorized();
  const buffer = await buildTemplateWorkbook();
  const body = new Uint8Array(buffer);
  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="food-import-template.xlsx"',
      'Content-Length': String(body.length),
    },
  });
}
