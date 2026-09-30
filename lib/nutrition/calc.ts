export interface PatientMetrics {
  gender: 'male' | 'female';
  birthDate: Date;
  heightCm: number;
  weightKg: number;
  activityLevel: 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
  goal: 'lose' | 'maintain' | 'gain';
  chronicConditions?: string[];
}

export interface NutritionTargets {
  bmi: number;
  bmr: number;
  tdee: number;
  targetCalories: number;
  targetProteinG: number;
  targetCarbsG: number;
  targetFatsG: number;
  targetWaterMl: number;
  safetyClamped: boolean;
  safetyWarning?: string;
  chronicConditionFlags: string[];
  doctorReviewRequired: boolean;
}

const ACTIVITY_MULTIPLIERS: Record<PatientMetrics['activityLevel'], number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

const GOAL_ADJUSTMENTS: Record<PatientMetrics['goal'], number> = {
  lose: -500,
  maintain: 0,
  gain: 500,
};

export const MIN_CALORIES = { male: 1500, female: 1200 } as const;

export function calculateAge(birthDate: Date): number {
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}

export function calculateBMI(weightKg: number, heightCm: number): number {
  const heightM = heightCm / 100;
  return Math.round((weightKg / (heightM * heightM)) * 10) / 10;
}

export function calculateBMR(gender: 'male' | 'female', weightKg: number, heightCm: number, age: number): number {
  // Mifflin-St Jeor equation
  if (gender === 'male') {
    return Math.round(10 * weightKg + 6.25 * heightCm - 5 * age + 5);
  }
  return Math.round(10 * weightKg + 6.25 * heightCm - 5 * age - 161);
}

export function calculateTDEE(bmr: number, activityLevel: PatientMetrics['activityLevel']): number {
  return Math.round(bmr * ACTIVITY_MULTIPLIERS[activityLevel]);
}

export function calculateMacroTargets(
  targetCalories: number,
  gender: 'male' | 'female',
  weightKg: number
): { proteinG: number; carbsG: number; fatsG: number } {
  // Protein: 1.6-2.2g/kg for weight loss, 1.2-1.6g/kg for maintenance/gain
  // Using 1.8g/kg as default, capped at 35% of calories
  const proteinG = Math.min(Math.round(weightKg * 1.8), Math.round(targetCalories * 0.35 / 4));
  
  // Fats: 25-30% of calories
  const fatsG = Math.round(targetCalories * 0.27 / 9);
  
  // Carbs: remaining calories
  const carbsG = Math.round((targetCalories - proteinG * 4 - fatsG * 9) / 4);
  
  return { proteinG, carbsG, fatsG };
}

export function calculateWaterTarget(weightKg: number): number {
  // 35ml per kg
  return Math.round(weightKg * 35);
}

export function checkChronicConditions(conditions?: string[]): { flags: string[]; doctorReviewRequired: boolean } {
  if (!conditions || conditions.length === 0) {
    return { flags: [], doctorReviewRequired: false };
  }
  
  const flags: string[] = [];
  let doctorReviewRequired = false;
  
  const conditionMap: Record<string, { flag: string; reviewRequired: boolean }> = {
    diabetes: { flag: 'Diabetes - monitor carbohydrate distribution', reviewRequired: true },
    kidney: { flag: 'Kidney disease - protein/potassium/phosphorus restrictions apply', reviewRequired: true },
    liver: { flag: 'Liver disease - protein/sodium modifications may be needed', reviewRequired: true },
    pregnancy: { flag: 'Pregnancy - increased calorie/micronutrient needs', reviewRequired: true },
    lactation: { flag: 'Lactation - additional 500 kcal/day recommended', reviewRequired: true },
  };
  
  for (const condition of conditions) {
    const normalized = condition.toLowerCase().trim();
    if (conditionMap[normalized]) {
      flags.push(conditionMap[normalized].flag);
      if (conditionMap[normalized].reviewRequired) {
        doctorReviewRequired = true;
      }
    } else {
      flags.push(`Custom condition: ${condition}`);
    }
  }
  
  return { flags, doctorReviewRequired };
}

export function calculateNutritionTargets(metrics: PatientMetrics): NutritionTargets {
  const age = calculateAge(metrics.birthDate);
  const bmi = calculateBMI(metrics.weightKg, metrics.heightCm);
  const bmr = calculateBMR(metrics.gender, metrics.weightKg, metrics.heightCm, age);
  const tdee = calculateTDEE(bmr, metrics.activityLevel);
  
  let targetCalories = tdee + GOAL_ADJUSTMENTS[metrics.goal];
  
  // Safety rails - server enforced
  const minCalories = MIN_CALORIES[metrics.gender];
  let safetyClamped = false;
  let safetyWarning: string | undefined;
  
  if (targetCalories < minCalories) {
    targetCalories = minCalories;
    safetyClamped = true;
    safetyWarning = `Target calories clamped to safety minimum of ${minCalories} kcal for ${metrics.gender}. Original target was below safety threshold.`;
  }
  
  const { proteinG, carbsG, fatsG } = calculateMacroTargets(targetCalories, metrics.gender, metrics.weightKg);
  const targetWaterMl = calculateWaterTarget(metrics.weightKg);
  
  const { flags, doctorReviewRequired } = checkChronicConditions(metrics.chronicConditions);
  
  return {
    bmi,
    bmr,
    tdee,
    targetCalories,
    targetProteinG: proteinG,
    targetCarbsG: carbsG,
    targetFatsG: fatsG,
    targetWaterMl,
    safetyClamped,
    safetyWarning,
    chronicConditionFlags: flags,
    doctorReviewRequired,
  };
}