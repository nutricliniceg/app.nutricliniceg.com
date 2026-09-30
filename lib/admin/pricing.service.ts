import { subscriptionPlansRepository, type SubscriptionPlanInput } from '@/lib/db/repositories/subscription-plans.repo';
import { fail } from '@/lib/plans';

// ADM-04: subscription plan catalog. Mutations are super_admin-only —
// enforced here AND in the routes (defense in depth for the matrix test).
export const pricingService = {
  async list() {
    return subscriptionPlansRepository.listAll();
  },

  async create(isSuper: boolean, input: SubscriptionPlanInput) {
    if (!isSuper) throw fail('FORBIDDEN', 'Pricing is managed by super admins');
    return { id: await subscriptionPlansRepository.insert(input) };
  },

  async update(isSuper: boolean, id: string, input: Partial<SubscriptionPlanInput>) {
    if (!isSuper) throw fail('FORBIDDEN', 'Pricing is managed by super admins');
    const row = await subscriptionPlansRepository.findById(id);
    if (!row) throw fail('NOT_FOUND', 'Plan not found');
    await subscriptionPlansRepository.update(id, input);
    return { id };
  },

  async remove(isSuper: boolean, id: string) {
    if (!isSuper) throw fail('FORBIDDEN', 'Pricing is managed by super admins');
    const row = await subscriptionPlansRepository.findById(id);
    if (!row) throw fail('NOT_FOUND', 'Plan not found');
    await subscriptionPlansRepository.remove(id);
    return { id };
  },
};
