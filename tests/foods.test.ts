import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkKcalConsistency, normalizeFoodName, validateImportRow } from '@/lib/foods/consistency';
import { foodsService } from '@/lib/foods/foods.service';
import { foodListsService } from '@/lib/foods/food-lists.service';
import { foodRequestsService } from '@/lib/foods/food-requests.service';
import { foodsRepository } from '@/lib/db/repositories/foods.repo';
import { foodListsRepository } from '@/lib/db/repositories/food-lists.repo';
import { foodRequestsRepository } from '@/lib/db/repositories/food-requests.repo';

vi.mock('@/lib/db/repositories/foods.repo', () => ({
  foodsRepository: {
    insert: vi.fn(),
    findById: vi.fn(),
    listVisible: vi.fn(),
    listForAdmin: vi.fn(),
    listVisibleNames: vi.fn(),
    listGlobalNames: vi.fn(),
    updateOwn: vi.fn(),
    updateGlobal: vi.fn(),
    setArchived: vi.fn(),
    remove: vi.fn(),
    countPlanReferences: vi.fn(),
  },
}));

vi.mock('@/lib/db/repositories/food-lists.repo', () => ({
  foodListsRepository: {
    insert: vi.fn(),
    findById: vi.fn(),
    listVisible: vi.fn(),
    listGlobal: vi.fn(),
    listAllForAdmin: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    listItems: vi.fn(),
    addItem: vi.fn(),
    removeItem: vi.fn(),
  },
}));

vi.mock('@/lib/db/repositories/food-requests.repo', () => ({
  foodRequestsRepository: {
    insert: vi.fn(),
    findById: vi.fn(),
    listByDoctor: vi.fn(),
    listQueue: vi.fn(),
    review: vi.fn(),
  },
}));

const fns = {
  foodsInsert: () => foodsRepository.insert as unknown as ReturnType<typeof vi.fn>,
  foodsFind: () => foodsRepository.findById as unknown as ReturnType<typeof vi.fn>,
  foodsNames: () => foodsRepository.listVisibleNames as unknown as ReturnType<typeof vi.fn>,
  foodsGlobalNames: () => foodsRepository.listGlobalNames as unknown as ReturnType<typeof vi.fn>,
  foodsRefs: () => foodsRepository.countPlanReferences as unknown as ReturnType<typeof vi.fn>,
  listsFind: () => foodListsRepository.findById as unknown as ReturnType<typeof vi.fn>,
  listsItems: () => foodListsRepository.listItems as unknown as ReturnType<typeof vi.fn>,
  reqFind: () => foodRequestsRepository.findById as unknown as ReturnType<typeof vi.fn>,
};

// Chicken breast: 4*31 + 4*0 + 9*3.6 = 124 + 32.4 = 156.4 vs declared 165 → 5.5% → OK
const goodMacros = { calories_per_100g: 165, protein_per_100g: 31, carbs_per_100g: 0, fats_per_100g: 3.6 };
// Declared 300 vs computed 156.4 → 92% deviation → reject
const badMacros = { calories_per_100g: 300, protein_per_100g: 31, carbs_per_100g: 0, fats_per_100g: 3.6 };

describe('kcal consistency (FL-09/FL-14)', () => {
  it('accepts values within ±15% of 4P+4C+9F', () => {
    const r = checkKcalConsistency(goodMacros);
    expect(r.ok).toBe(true);
    expect(r.expected).toBeCloseTo(156.4, 1);
  });

  it('rejects values beyond ±15%', () => {
    expect(checkKcalConsistency(badMacros).ok).toBe(false);
  });

  it('accepts zero macros with zero kcal (water)', () => {
    expect(
      checkKcalConsistency({ calories_per_100g: 0, protein_per_100g: 0, carbs_per_100g: 0, fats_per_100g: 0 }).ok
    ).toBe(true);
  });
});

describe('name normalization + dedupe (FL-04)', () => {
  it('unifies alef forms and strips tashkeel', () => {
    expect(normalizeFoodName('أرز')).toBe(normalizeFoodName('ارز'));
    expect(normalizeFoodName('لَبَن')).toBe(normalizeFoodName('لبن'));
  });

  it('flags bad-kcal rows with a readable reason', () => {
    const issue = validateImportRow({ name_ar: 'X', name_en: null, ...badMacros }, 2, [], []);
    expect(issue).not.toBeNull();
    expect(issue?.reason).toMatch(/kcal mismatch/);
  });

  it('flags duplicates against visible names and within the batch', () => {
    const existing = [{ name_ar: 'أرز أبيض', name_en: 'Rice' }];
    const dup = validateImportRow({ name_ar: 'ارز  أبيض', name_en: null, ...goodMacros }, 3, existing, []);
    expect(dup?.reason).toMatch(/Duplicate/);
    const batchDup = validateImportRow(
      { name_ar: 'New food', name_en: null, ...goodMacros },
      4,
      [],
      [{ name_ar: 'new FOOD', name_en: null }]
    );
    expect(batchDup?.reason).toMatch(/Duplicate/);
  });
});

describe('ownership scoping (FL-01/02/10/11)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('doctor B cannot update or delete doctor A items (generic 404 → null)', async () => {
    fns.foodsFind().mockResolvedValue({ id: 'f1', owner_id: 'docA', archived: false, name_ar: 'X' });
    expect(await foodsService.update('f1', 'docB', { name_ar: 'Y' }, false)).toBeNull();
    expect(await foodsService.remove('f1', 'docB', false)).toBeNull();
    expect(fns.foodsInsert()).not.toHaveBeenCalled();
  });

  it('doctor creates private items; admin creates verified global items', async () => {
    fns.foodsNames().mockResolvedValue([]);
    fns.foodsGlobalNames().mockResolvedValue([]);
    await foodsService.create('doc1', { name_ar: 'Mine', ...goodMacros }, false);
    expect(fns.foodsInsert()).toHaveBeenCalledWith(expect.objectContaining({ ownerId: 'doc1', isVerified: false }));
    await foodsService.create('adm1', { name_ar: 'Global', ...goodMacros }, true);
    expect(fns.foodsInsert()).toHaveBeenCalledWith(expect.objectContaining({ ownerId: null, isVerified: true }));
  });

  it('doctor cannot touch global items', async () => {
    fns.foodsFind().mockResolvedValue({ id: 'g1', owner_id: null, archived: false, name_ar: 'G' });
    expect(await foodsService.update('g1', 'doc1', { name_ar: 'Hacked' }, false)).toBeNull();
    expect(await foodsService.remove('g1', 'doc1', false)).toBeNull();
  });
});

describe('archive-prevents-delete (FL-17)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('archives referenced items instead of deleting', async () => {
    fns.foodsFind().mockResolvedValue({ id: 'f1', owner_id: 'doc1', archived: false, name_ar: 'X' });
    fns.foodsRefs().mockResolvedValue(2);
    const res = await foodsService.remove('f1', 'doc1', false);
    expect(res).toEqual({ archived: true });
    expect(foodsRepository.setArchived).toHaveBeenCalledWith('f1', true);
    expect(foodsRepository.remove).not.toHaveBeenCalled();
  });

  it('hard-deletes unreferenced items', async () => {
    fns.foodsFind().mockResolvedValue({ id: 'f1', owner_id: 'doc1', archived: false, name_ar: 'X' });
    fns.foodsRefs().mockResolvedValue(0);
    const res = await foodsService.remove('f1', 'doc1', false);
    expect(res).toEqual({ archived: false });
    expect(foodsRepository.remove).toHaveBeenCalledWith('f1');
  });
});

describe('import report (FL-03/12)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects exactly the bad-kcal row, skips the dupe, imports the rest', async () => {
    fns.foodsNames().mockResolvedValue([{ name_ar: 'أرز أبيض', name_en: null }]);
    const report = await foodsService.importRows(
      'doc1',
      [
        { name_ar: 'Good food', name_en: null, ...goodMacros },
        { name_ar: 'Bad kcal', name_en: null, ...badMacros },
        { name_ar: 'ارز أبيض', name_en: null, ...goodMacros },
      ],
      'mine',
      false
    );
    expect(report.imported).toBe(1);
    expect(report.rejected).toHaveLength(1);
    expect(report.rejected[0].name).toBe('Bad kcal');
    expect(report.skipped).toHaveLength(1);
    expect(fns.foodsInsert()).toHaveBeenCalledTimes(1);
  });
});

describe('request → approve → global flow (FL-15/16)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('approving a request creates a global item visible to all', async () => {
    fns.reqFind().mockResolvedValue({
      id: 'r1',
      doctor_id: 'doc1',
      status: 'pending',
      name_ar: 'Quinoa',
      name_en: null,
      calories_per_100g: 120,
      protein_per_100g: 4.4,
      carbs_per_100g: 21,
      fats_per_100g: 1.9,
      category: 'starch',
    });
    fns.foodsGlobalNames().mockResolvedValue([]);
    const res = await foodRequestsService.review('r1', 'adm1', 'approve');
    expect(res?.status).toBe('approved');
    expect(res?.foodId).toBeTruthy();
    expect(fns.foodsInsert()).toHaveBeenCalledWith(expect.objectContaining({ ownerId: null, isVerified: true }));
    expect(foodRequestsRepository.review).toHaveBeenCalledWith('r1', 'approved', null, 'adm1');
  });

  it('returns null for already-reviewed requests', async () => {
    fns.reqFind().mockResolvedValue({ id: 'r1', status: 'approved' });
    expect(await foodRequestsService.review('r1', 'adm1', 'approve')).toBeNull();
  });
});

describe('copy public list as base (FL-13)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('clones global items into private copies owned by the doctor', async () => {
    fns.listsFind().mockResolvedValue({ id: 'l1', is_global: true, owner_id: null, name_ar: 'Base', name_en: null, description_ar: null, description_en: null });
    fns.listsItems().mockResolvedValue([{ id: 'm1', list_id: 'l1', food_id: 'g1', order_index: 0 }]);
    fns.foodsFind().mockResolvedValue({
      id: 'g1',
      name_ar: 'G',
      name_en: null,
      calories_per_100g: 100,
      protein_per_100g: 5,
      carbs_per_100g: 10,
      fats_per_100g: 5,
      category: 'other',
      tags: null,
      pairing_tags: null,
      archived: false,
    });
    const res = await foodListsService.copyAsBase('doc1', 'l1');
    expect(res?.copied).toBe(1);
    expect(fns.foodsInsert()).toHaveBeenCalledWith(expect.objectContaining({ ownerId: 'doc1', isVerified: false }));
  });

  it('refuses to copy another doctor private list', async () => {
    fns.listsFind().mockResolvedValue({ id: 'l2', is_global: false, owner_id: 'docA' });
    expect(await foodListsService.copyAsBase('docB', 'l2')).toBeNull();
  });
});
