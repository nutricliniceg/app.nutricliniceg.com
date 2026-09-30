// JSON helpers for AI-07 structured calls: tolerant extraction of the JSON
// payload from model prose, plus disclaimer stripping for re-parsing.
export function tryParseJson(text: string): { ok: true; value: unknown } | { ok: false } {
  const fenced = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
  try {
    return { ok: true, value: JSON.parse(fenced) };
  } catch {
    const start = fenced.search(/[{[]/);
    if (start >= 0) {
      try {
        return { ok: true, value: JSON.parse(fenced.slice(start)) };
      } catch {
        return { ok: false };
      }
    }
    return { ok: false };
  }
}

export function coerceLabItems(value: unknown): Array<{ name: string; value: number; unit: string | null }> {
  if (!Array.isArray(value)) return [];
  return value
    .filter((i) => i && typeof (i as { name?: unknown }).name === 'string' && Number.isFinite(Number((i as { value?: unknown }).value)))
    .slice(0, 50)
    .map((i) => {
      const item = i as { name: string; value: number; unit?: unknown };
      return {
        name: String(item.name).slice(0, 120),
        value: Number(item.value),
        unit: item.unit ? String(item.unit).slice(0, 20) : null,
      };
    });
}
