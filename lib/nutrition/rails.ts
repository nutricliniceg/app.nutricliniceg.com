import { MIN_CALORIES } from './calc';

// §8.5 safety rails (DASH-09/NUT-18): ABSOLUTE floors. No caller — human or
// AI — may publish a plan below 1200 kcal (female) / 1500 kcal (male).
export type Gender = 'male' | 'female';

export function calorieFloor(gender: Gender): number {
  return MIN_CALORIES[gender];
}

export interface ClampedTarget {
  target: number;
  clamped: boolean;
  floor: number;
}

export function clampTargetCalories(requested: number, gender: Gender): ClampedTarget {
  const floor = calorieFloor(gender);
  if (requested >= floor) return { target: Math.round(requested), clamped: false, floor };
  return { target: floor, clamped: true, floor };
}

// Ideal weight for per-kg clinical caps (BMI 22 reference).
export function idealWeightKg(heightCm: number): number {
  const m = Math.max(1, heightCm) / 100;
  return Math.round(22 * m * m * 10) / 10;
}
