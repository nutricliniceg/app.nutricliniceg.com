import { describe, it, expect } from 'vitest';
import {
  calculateAge,
  calculateBMI,
  calculateBMR,
  calculateTDEE,
  calculateMacroTargets,
  calculateWaterTarget,
  checkChronicConditions,
  calculateNutritionTargets,
  type PatientMetrics,
} from '@/lib/nutrition/calc';

describe('Nutrition Calculations', () => {
  describe('calculateAge', () => {
    it('should calculate age correctly for birthday passed this year', () => {
      const birthDate = new Date('1990-01-15');
      const today = new Date();
      const expectedAge = today.getFullYear() - 1990;
      expect(calculateAge(birthDate)).toBe(expectedAge);
    });

    it('should calculate age correctly for birthday not yet passed this year', () => {
      const futureDate = new Date();
      futureDate.setFullYear(futureDate.getFullYear() + 1);
      expect(calculateAge(futureDate)).toBe(-1);
    });

    it('should handle leap year birthdays', () => {
      const birthDate = new Date('2000-02-29');
      const age = calculateAge(birthDate);
      expect(age).toBeGreaterThanOrEqual(0);
    });
  });

  describe('calculateBMI', () => {
    it('should calculate BMI correctly', () => {
      expect(calculateBMI(70, 175)).toBe(22.9);
      expect(calculateBMI(90, 180)).toBe(27.8);
      expect(calculateBMI(50, 160)).toBe(19.5);
    });

    it('should handle edge cases', () => {
      expect(calculateBMI(0, 170)).toBe(0);
      expect(calculateBMI(100, 100)).toBe(100);
    });
  });

  describe('calculateBMR', () => {
    it('should calculate BMR for male using Mifflin-St Jeor', () => {
      // Male, 70kg, 175cm, 30 years
      // 10*70 + 6.25*175 - 5*30 + 5 = 700 + 1093.75 - 150 + 5 = 1648.75 -> 1649
      expect(calculateBMR('male', 70, 175, 30)).toBe(1649);
    });

    it('should calculate BMR for female using Mifflin-St Jeor', () => {
      // Female, 60kg, 165cm, 25 years
      // 10*60 + 6.25*165 - 5*25 - 161 = 600 + 1031.25 - 125 - 161 = 1345.25 -> 1345
      expect(calculateBMR('female', 60, 165, 25)).toBe(1345);
    });
  });

  describe('calculateTDEE', () => {
    it('should apply activity multipliers correctly', () => {
      const bmr = 1500;
      expect(calculateTDEE(bmr, 'sedentary')).toBe(1800);
      expect(calculateTDEE(bmr, 'light')).toBe(2063);
      expect(calculateTDEE(bmr, 'moderate')).toBe(2325);
      expect(calculateTDEE(bmr, 'active')).toBe(2588);
      expect(calculateTDEE(bmr, 'very_active')).toBe(2850);
    });
  });

  describe('calculateMacroTargets', () => {
    it('should distribute macros within reasonable ranges', () => {
      const { proteinG, carbsG, fatsG } = calculateMacroTargets(2000, 'male', 80);
      
      // Protein: min(80*1.8=144, 2000*0.35/4=175) = 144
      expect(proteinG).toBe(144);
      
      // Fats: 2000*0.27/9 = 60
      expect(fatsG).toBe(60);
      
      // Carbs: (2000 - 144*4 - 60*9)/4 = (2000 - 576 - 540)/4 = 884/4 = 221
      expect(carbsG).toBe(221);
    });

    it('should cap protein at 35% of calories', () => {
      const { proteinG } = calculateMacroTargets(1500, 'male', 100);
      // min(100*1.8=180, 1500*0.35/4=131) = 131
      expect(proteinG).toBe(131);
    });
  });

  describe('calculateWaterTarget', () => {
    it('should calculate 35ml per kg', () => {
      expect(calculateWaterTarget(70)).toBe(2450);
      expect(calculateWaterTarget(50)).toBe(1750);
    });
  });

  describe('checkChronicConditions', () => {
    it('should return empty for no conditions', () => {
      const result = checkChronicConditions([]);
      expect(result.flags).toEqual([]);
      expect(result.doctorReviewRequired).toBe(false);
    });

    it('should flag diabetes with review required', () => {
      const result = checkChronicConditions(['diabetes']);
      expect(result.flags).toContain('Diabetes - monitor carbohydrate distribution');
      expect(result.doctorReviewRequired).toBe(true);
    });

    it('should flag kidney disease with review required', () => {
      const result = checkChronicConditions(['kidney']);
      expect(result.flags).toContain('Kidney disease - protein/potassium/phosphorus restrictions apply');
      expect(result.doctorReviewRequired).toBe(true);
    });

    it('should handle case insensitive conditions', () => {
      const result = checkChronicConditions(['DIABETES', 'Kidney']);
      expect(result.doctorReviewRequired).toBe(true);
      expect(result.flags.length).toBe(2);
    });

    it('should handle custom conditions', () => {
      const result = checkChronicConditions(['custom condition']);
      expect(result.flags).toContain('Custom condition: custom condition');
    });
  });

  describe('calculateNutritionTargets - full integration', () => {
    const baseMetrics: PatientMetrics = {
      gender: 'female',
      birthDate: new Date('1990-01-01'),
      heightCm: 165,
      weightKg: 65,
      activityLevel: 'moderate',
      goal: 'maintain',
    };

    it('should calculate full targets for standard female', () => {
      const result = calculateNutritionTargets(baseMetrics);
      
      expect(result.bmi).toBeGreaterThan(0);
      expect(result.bmr).toBeGreaterThan(0);
      expect(result.tdee).toBeGreaterThan(result.bmr);
      expect(result.targetCalories).toBe(result.tdee); // maintain = no adjustment
      expect(result.targetProteinG).toBeGreaterThan(0);
      expect(result.targetCarbsG).toBeGreaterThan(0);
      expect(result.targetFatsG).toBeGreaterThan(0);
      expect(result.targetWaterMl).toBeGreaterThan(0);
      expect(result.safetyClamped).toBe(false);
      expect(result.doctorReviewRequired).toBe(false);
    });

    it('should clamp female target below 1200 kcal', () => {
      const metrics: PatientMetrics = {
        ...baseMetrics,
        weightKg: 40,
        heightCm: 150,
        activityLevel: 'sedentary',
        goal: 'lose',
      };
      
      const result = calculateNutritionTargets(metrics);
      
      expect(result.targetCalories).toBe(1200);
      expect(result.safetyClamped).toBe(true);
      expect(result.safetyWarning).toContain('1200');
      expect(result.safetyWarning).toContain('female');
    });

    it('should clamp male target below 1500 kcal', () => {
      const metrics: PatientMetrics = {
        ...baseMetrics,
        gender: 'male',
        weightKg: 45,
        heightCm: 160,
        activityLevel: 'sedentary',
        goal: 'lose',
      };
      
      const result = calculateNutritionTargets(metrics);
      
      expect(result.targetCalories).toBe(1500);
      expect(result.safetyClamped).toBe(true);
      expect(result.safetyWarning).toContain('1500');
      expect(result.safetyWarning).toContain('male');
    });

    it('should add doctor review required for diabetes', () => {
      const metrics: PatientMetrics = {
        ...baseMetrics,
        chronicConditions: ['diabetes'],
      };
      
      const result = calculateNutritionTargets(metrics);
      
      expect(result.doctorReviewRequired).toBe(true);
      expect(result.chronicConditionFlags).toContain('Diabetes - monitor carbohydrate distribution');
    });

    it('should add doctor review required for kidney disease', () => {
      const metrics: PatientMetrics = {
        ...baseMetrics,
        chronicConditions: ['kidney'],
      };
      
      const result = calculateNutritionTargets(metrics);
      
      expect(result.doctorReviewRequired).toBe(true);
      expect(result.chronicConditionFlags).toContain('Kidney disease - protein/potassium/phosphorus restrictions apply');
    });

    it('should apply goal adjustments', () => {
      const loseMetrics = { ...baseMetrics, goal: 'lose' as const };
      const gainMetrics = { ...baseMetrics, goal: 'gain' as const };
      
      const loseResult = calculateNutritionTargets(loseMetrics);
      const gainResult = calculateNutritionTargets(gainMetrics);
      const maintainResult = calculateNutritionTargets(baseMetrics);
      
      expect(loseResult.targetCalories).toBe(maintainResult.targetCalories - 500);
      expect(gainResult.targetCalories).toBe(maintainResult.targetCalories + 500);
    });

    it('should handle extreme age ranges', () => {
      const childMetrics: PatientMetrics = {
        ...baseMetrics,
        birthDate: new Date('2015-01-01'), // ~10 years old
      };
      
      const elderlyMetrics: PatientMetrics = {
        ...baseMetrics,
        birthDate: new Date('1930-01-01'), // ~95 years old
      };
      
      const childResult = calculateNutritionTargets(childMetrics);
      const elderlyResult = calculateNutritionTargets(elderlyMetrics);
      
      expect(childResult.bmr).toBeGreaterThan(0);
      expect(elderlyResult.bmr).toBeGreaterThan(0);
    });

    it('should handle multiple chronic conditions', () => {
      const metrics: PatientMetrics = {
        ...baseMetrics,
        chronicConditions: ['diabetes', 'kidney', 'hypertension'],
      };
      
      const result = calculateNutritionTargets(metrics);
      
      expect(result.doctorReviewRequired).toBe(true);
      expect(result.chronicConditionFlags.length).toBeGreaterThanOrEqual(2);
    });
  });
});