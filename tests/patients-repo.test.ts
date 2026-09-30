import { describe, it, expect, vi, beforeEach } from 'vitest';
import { patientRepository } from '@/lib/db/repositories/patients.repo';
import { executeQuery } from '@/lib/db/pool';

vi.mock('@/lib/db/pool');

type Mock = ReturnType<typeof vi.fn>;

describe('patients.repo', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates with UUID + placeholders', async () => {
    (executeQuery as unknown as Mock).mockResolvedValue([]);
    const id = await patientRepository.create('doc1', {
      name_ar: 'Test',
      gender: 'male',
      birth_date: '1990-01-01',
      height_cm: 175,
      initial_weight_kg: 80,
      activity_level: 'moderate',
      goal: 'maintain',
    });
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    const [sql, params] = (executeQuery as unknown as Mock).mock.calls[0];
    expect(sql).toContain('INSERT INTO Patient');
    expect(params[1]).toBe('doc1');
    expect(sql).not.toContain('Test');
  });

  it('maps JSON columns to arrays on read', async () => {
    (executeQuery as unknown as Mock).mockResolvedValue([
      { id: 'p1', chronic_conditions: '["diabetes"]', allergies: null },
    ]);
    const p = await patientRepository.findById('p1');
    expect(p?.chronic_conditions).toEqual(['diabetes']);
    expect(p?.allergies).toBeNull();
  });

  it('returns null when missing', async () => {
    (executeQuery as unknown as Mock).mockResolvedValue([]);
    expect(await patientRepository.findById('nope')).toBeNull();
  });

  it('builds search filters with placeholders only', async () => {
    (executeQuery as unknown as Mock)
      .mockResolvedValueOnce([{ id: 'p1' }])
      .mockResolvedValueOnce([{ count: 1 }]);
    const res = await patientRepository.findByDoctor('doc1', { search: "x' OR '1'='1", gender: 'female' });
    expect(res.total).toBe(1);
    const [sql, params] = (executeQuery as unknown as Mock).mock.calls[0];
    expect(sql).toContain('name_ar LIKE ?');
    expect(params).toContain("%x' OR '1'='1%");
  });

  it('aggregates dashboard stats', async () => {
    (executeQuery as unknown as Mock)
      .mockResolvedValueOnce([{ count: 5 }])
      .mockResolvedValueOnce([{ count: 2 }])
      .mockResolvedValueOnce([{ count: 3 }]);
    const stats = await patientRepository.getStats('doc1');
    expect(stats).toEqual({ total: 5, visitsThisWeek: 2, activePlans: 3 });
  });
});
