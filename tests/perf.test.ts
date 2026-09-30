import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const calls: Array<{ sql: string; params: unknown[] }> = [];

vi.mock('@/lib/db/pool', () => ({
  executeQuery: vi.fn(async (sql: string, params: unknown[] = []) => {
    calls.push({ sql, params });
    if (sql.startsWith('SELECT * FROM NutritionPlanMealItem WHERE meal_id IN')) {
      return [
        { id: 'i1', meal_id: 'm1' },
        { id: 'i2', meal_id: 'm1' },
        { id: 'i3', meal_id: 'm2' },
      ];
    }
    if (sql.startsWith('SELECT * FROM NutritionPlanMeal WHERE')) {
      return [{ id: 'm1' }, { id: 'm2' }];
    }
    if (sql.startsWith('SELECT * FROM ExercisePlanExercise WHERE day_id IN')) {
      return [{ id: 'e1', day_id: 'd1' }];
    }
    if (sql.startsWith('SELECT * FROM ExercisePlanDay WHERE')) {
      return [{ id: 'd1' }];
    }
    if (sql.startsWith('SELECT * FROM ExercisePlan WHERE')) {
      return [{ id: 'p1' }];
    }
    return [];
  }),
}));

beforeEach(() => {
  calls.length = 0;
});

describe('P31 PF-02 query batching', () => {
  it('nutrition getFullPlan uses 3 queries total (plan + meals + one IN batch)', async () => {
    const { plansRepository } = await import('@/lib/db/repositories/plans.repo');
    vi.spyOn(plansRepository, 'findOwnedById').mockResolvedValue({ id: 'p1' } as never);
    try {
      const full = await plansRepository.getFullPlan('p1', 'd1');
      expect(full?.meals).toHaveLength(2);
      expect(full?.meals[0].items).toHaveLength(2);
      expect(full?.meals[1].items).toHaveLength(1);
      const itemQueries = calls.filter((c) => c.sql.includes('NutritionPlanMealItem'));
      expect(itemQueries).toHaveLength(1);
      expect(itemQueries[0].sql).toContain('IN (?,?)');
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('exercise getFullPlan uses one IN batch for exercises', async () => {
    const { exercisesRepository } = await import('@/lib/db/repositories/exercises.repo');
    const full = await exercisesRepository.getFullPlan('p1', 'd1');
    expect(full?.days).toHaveLength(1);
    expect(full?.days[0].exercises).toHaveLength(1);
    const itemQueries = calls.filter((c) => c.sql.includes('ExercisePlanExercise WHERE'));
    expect(itemQueries).toHaveLength(1);
    expect(itemQueries[0].sql).toContain('IN (?)');
  });

  it('admin broadcast recipients insert in a single multi-row statement', async () => {
    const { adminMessagesRepository } = await import('@/lib/db/repositories/admin-messages.repo');
    await adminMessagesRepository.addRecipients('msg1', ['u1', 'u2', 'u3']);
    const inserts = calls.filter((c) => c.sql.includes('AdminMessageRecipient'));
    expect(inserts).toHaveLength(1);
    expect(inserts[0].sql).toContain('VALUES (?, ?, ?),(?, ?, ?),(?, ?, ?)');
    expect(inserts[0].params).toHaveLength(9);
  });

  it('blog setTags deletes then inserts tags in one statement', async () => {
    const { blogAdminRepository } = await import('@/lib/db/repositories/blog-admin.repo');
    await blogAdminRepository.setTags('post1', ['t1', 't2']);
    const inserts = calls.filter((c) => c.sql.includes('INSERT INTO BlogPostTag'));
    expect(inserts).toHaveLength(1);
    expect(inserts[0].sql).toContain('VALUES (?, ?),(?, ?)');
  });
});

describe('P31 PF-02 Server-Timing', () => {
  it('timed() sets Server-Timing and preserves the response', async () => {
    const { timed } = await import('@/lib/api/timing');
    const handler = timed(async (_req: NextRequest) => NextResponse.json({ ok: true }));
    const res = await handler(new NextRequest('https://app.test/api/x'));
    expect(res.headers.get('Server-Timing')).toMatch(/^app;dur=\d+$/);
    expect(await res.json()).toEqual({ ok: true });
  });
});
