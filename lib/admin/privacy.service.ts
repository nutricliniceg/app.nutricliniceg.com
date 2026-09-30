import { userRepository } from '@/lib/db/repositories/users.repo';
import { privacyRepository } from '@/lib/db/repositories/privacy.repo';
import { fail } from '@/lib/plans';

// CMP-04: right to export + right to erasure. Export returns every row the
// platform holds for a doctor (profile, patients + visits + plans +
// messages + AI usage + files metadata — never file bytes). Erasure
// hard-deletes the doctor row; FK cascades remove owned clinical data.
// Both actions are audited by the calling route.
export const privacyService = {
  async exportDoctorData(userId: string): Promise<Record<string, unknown>> {
    const user = await userRepository.findById(userId);
    if (!user) throw fail('NOT_FOUND', 'User not found');
    const [patients, visits, nutritionPlans, exercisePlans, messages, aiUsage, files, subscriptions] = await Promise.all([
      privacyRepository.exportTable('Patient', userId),
      privacyRepository.exportTable('Visit', userId),
      privacyRepository.exportTable('NutritionPlan', userId),
      privacyRepository.exportTable('ExercisePlan', userId),
      privacyRepository.exportTable('PatientMessage', userId),
      privacyRepository.exportTable('AiUsageLog', userId),
      privacyRepository.exportTable('FileAsset', userId),
      privacyRepository.exportTable('Subscription', userId),
    ]);
    return {
      exported_at: new Date().toISOString(),
      user,
      patients, visits, nutritionPlans, exercisePlans, messages, aiUsage, files, subscriptions,
    };
  },

  async eraseDoctorData(adminId: string, userId: string): Promise<{ erased: boolean }> {
    if (adminId === userId) throw fail('FORBIDDEN', 'You cannot erase your own account');
    const user = await userRepository.findById(userId);
    if (!user) throw fail('NOT_FOUND', 'User not found');
    // Hard delete; FK ON DELETE CASCADE removes owned rows. File bytes on
    // disk are orphaned by design — the weekly cleanup prunes unreferenced
    // stored files (see docs/cron-operations.md).
    await privacyRepository.hardDeleteUser(userId);
    return { erased: true };
  },
};
