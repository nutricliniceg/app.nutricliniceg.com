import { describe, it, expect, beforeEach } from 'vitest';
import { round5, toNutritionPrintView, toExercisePrintView } from '@/lib/print/views';
import { resolveBrand, resolveLogoReference, PLATFORM_BRAND } from '@/lib/print/branding';
import { mintPrintKey, verifyPrintKey } from '@/lib/print/print-links';

const brand = { clinicName: 'عيادة الشمس', doctorName: 'د. أحمد', logoUrl: 'https://x/logo.png', isFallback: false };

describe('P18 print rounding + calorie flag', () => {
  it('rounds grams to patient-friendly 5g steps', () => {
    expect(round5(77.78)).toBe(80);
    expect(round5(61)).toBe(60);
    expect(round5(3)).toBe(5);
    expect(round5(0)).toBe(0);
  });

  it('keeps server-persisted values and honors the calorie flag', () => {
    const meals = [{
      day: 1, mealName: 'Breakfast',
      items: [{ nameAr: 'شوفان', nameEn: null, grams: 77.78, proteinG: 10, carbsG: 50, fatsG: 5, calories: 290 }],
    }];
    const meta = { brand, patientName: 'مريض', targets: { calories: 1400, proteinG: 80, carbsG: 150, fatsG: 45 }, showCalories: false };
    const hidden = toNutritionPrintView(meals, meta);
    expect(hidden.showCalories).toBe(false);
    expect(hidden.meals[0].items[0].grams).toBe(80);
    expect(hidden.meals[0].items[0].calories).toBe(290);
    const shown = toNutritionPrintView(meals, { ...meta, showCalories: true });
    expect(shown.showCalories).toBe(true);
  });

  it('rail enforcement is not bypassable: views carry no target override path', () => {
    // The view builder accepts persisted rows only — no calorie/target
    // input exists, so a low (rails-clamped) server plan prints as stored.
    const view = toNutritionPrintView([], { brand, patientName: 'p', targets: { calories: 1200, proteinG: 60, carbsG: 120, fatsG: 40 }, showCalories: true });
    expect(view.targets.calories).toBe(1200);
    expect(Object.keys(view)).not.toContain('target_calories_override');
  });
});

describe('P18 white-label fallback', () => {
  it('falls back to platform branding when unset', () => {
    const fallback = resolveBrand({ name: 'د. أحمد', clinic_name: null, clinic_logo_url: null }, () => 'u');
    expect(fallback).toEqual({ clinicName: PLATFORM_BRAND.name, doctorName: 'د. أحمد', logoUrl: null, isFallback: true });
  });

  it('resolves uploaded file: refs and passes https through', () => {
    expect(resolveLogoReference('file:abc', (id) => `/dl/${id}`)).toBe('/dl/abc');
    expect(resolveLogoReference('https://x/l.png', () => 'u')).toBe('https://x/l.png');
    expect(resolveLogoReference('http://x/l.png', () => 'u')).toBeNull();
    expect(resolveLogoReference(null, () => 'u')).toBeNull();
  });

  it('uploading a logo changes print output on next render', () => {
    const before = resolveBrand({ name: 'd', clinic_name: 'C', clinic_logo_url: null }, () => 'u');
    const after = resolveBrand({ name: 'd', clinic_name: 'C', clinic_logo_url: 'file:new' }, (id) => `/dl/${id}?t=2`);
    expect(before.logoUrl).toBeNull();
    expect(after.logoUrl).toBe('/dl/new?t=2');
  });
});

describe('P18 print share links', () => {
  beforeEach(() => {
    process.env.FILE_URL_SECRET = 'test-file-url-secret-16';
  });

  it('round-trips and rejects wrong-plan/expired/tampered keys', () => {
    const key = mintPrintKey('nutrition', 'plan-1');
    expect(verifyPrintKey(key)).toEqual({ planType: 'nutrition', planId: 'plan-1' });
    expect(verifyPrintKey(mintPrintKey('exercise', 'plan-1'))?.planType).toBe('exercise');
    expect(verifyPrintKey(mintPrintKey('nutrition', 'plan-1', -1000))).toBeNull();
    expect(verifyPrintKey(`${key.slice(0, -2)}XX`)).toBeNull();
    expect(verifyPrintKey('garbage')).toBeNull();
  });
});

describe('P18 exercise print videos', () => {
  it('attaches QR-less links + thumbnails per exercise', () => {
    const view = toExercisePrintView(
      [{ day: 1, exercises: [{ nameAr: 'سكوات', nameEn: null, sets: 3, reps: 12, restSeconds: 60, notes: null, youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ' }] }],
      { brand, patientName: 'p' }
    );
    const ex = view.days[0].exercises[0];
    expect(ex.videoId).toBe('dQw4w9WgXcQ');
    expect(ex.thumbnail).toContain('dQw4w9WgXcQ');
    expect(ex.youtubeUrl).toContain('youtu.be');
  });
});
