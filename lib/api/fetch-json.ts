// Shared client-side API reader (was copy-pasted in 17 components).
// Response envelope matches lib/api/response.ts ok()/fail().
export async function readApi<T>(res: Response): Promise<T> {
  const body = (await res.json()) as { success: boolean; data: T; error?: { message: string } };
  if (!body.success) throw new Error(body.error?.message ?? 'Request failed');
  return body.data;
}
