#!/usr/bin/env node
// P32-SEED — idempotent demo/content seed for the staging environment.
//
// Scope, by design (privacy by design): this writes ONLY the content tables
// the public pages read. It never touches User, Patient, NutritionPlan,
// ExercisePlan, Subscription, Payment or AuditLog — those stay empty.
//
//   SubscriptionPlan   3 public pricing plans
//   BlogPost           6 published posts (3 ar + 3 en, translation-linked)
//   PlanTemplate       8 global nutrition templates
//   FoodItem           30 global verified foods
//
// Every write goes through the SAME repository / service the production app
// uses, so the real validation runs (Zod schemas, slug uniqueness, the
// FL-09/14 kcal consistency gate, markdown→HTML + sanitising, reading time,
// revision snapshots, tag/cache revalidation). No raw SQL INSERTs anywhere in
// this file.
//
// Idempotent: re-running updates in place and never duplicates a row.
//   - plans      keyed on name_en (SubscriptionPlan has no slug column)
//   - foods      keyed on name_ar (Arabic-aware normalised dedupe)
//   - posts      keyed on (slug, locale)
//   - templates  keyed on name
//
// Usage:
//   node --env-file=.env.local --import ./scripts/register-alias.mjs scripts/seed-demo.ts
//   node ... scripts/seed-demo.ts --dry     # validate + report, write nothing
//   node ... scripts/seed-demo.ts --verify  # counts only, no writes

import { randomUUID } from 'node:crypto';
import { executeQuery } from '@/lib/db/pool';
import { subscriptionPlansRepository } from '@/lib/db/repositories/subscription-plans.repo';
import { foodsRepository } from '@/lib/db/repositories/foods.repo';
import { blogAdminRepository } from '@/lib/db/repositories/blog-admin.repo';
import { templatesRepository } from '@/lib/db/repositories/templates.repo';
import { foodsService } from '@/lib/foods/foods.service';
import { postsService } from '@/lib/blog-admin/posts.service';
import { postCreateSchema } from '@/lib/blog-admin/post.schema';
import { subscriptionPlanSchema } from '@/lib/admin/admin.schema';
import { SEED_FOODS, kcalFromMacros } from './seed-data/food-items';
import { SEED_PLANS } from './seed-data/pricing-plans';
import { SEED_POSTS } from './seed-data/blog-posts';
import { SEED_TEMPLATES, type TemplateFoodRef } from './seed-data/plan-templates';
import { SEED_EXERCISE_DEBT } from './seed-data/exercise-debt';
import { withRetry, isConnectionError, reportFailure } from './seed-runtime/seed-retry';
import { closeDbPool } from './seed-runtime/seed-pool';

const DRY = process.argv.includes('--dry');
const VERIFY_ONLY = process.argv.includes('--verify');

let created = 0;
let updated = 0;
let skipped = 0;

function log(msg: string) {
  console.log(msg);
}

async function seedPlans(): Promise<void> {
  const existing = await subscriptionPlansRepository.listAll();
  const byName = new Map(existing.map((p) => [p.name_en, p]));
  for (const plan of SEED_PLANS) {
    // Same Zod schema the admin pricing screen validates against.
    const parsed = subscriptionPlanSchema.parse({
      name_ar: plan.name_ar,
      name_en: plan.name_en,
      description_ar: plan.description_ar,
      description_en: plan.description_en,
      price_monthly: plan.price,
      price_yearly: null,
      duration_days: plan.duration_days,
      max_patients: plan.max_patients,
      max_ai_calls_monthly: plan.max_ai_calls_monthly,
      features: plan.features,
      is_active: true,
      sort_order: plan.sort_order,
    });
    const found = byName.get(plan.key);
    if (found) {
      if (!DRY) {
        await subscriptionPlansRepository.update(found.id, {
          nameAr: parsed.name_ar, nameEn: parsed.name_en,
          descriptionAr: parsed.description_ar, descriptionEn: parsed.description_en,
          priceMonthly: parsed.price_monthly, durationDays: parsed.duration_days,
          maxPatients: parsed.max_patients, maxAiCallsMonthly: parsed.max_ai_calls_monthly,
          features: parsed.features, isActive: true, sortOrder: parsed.sort_order,
        });
      }
      updated++;
      log(`  plan "${plan.key}"            -> updated ${found.id}`);
    } else {
      const id = DRY ? '(dry-run)' : await subscriptionPlansRepository.insert({
        nameAr: parsed.name_ar, nameEn: parsed.name_en,
        descriptionAr: parsed.description_ar, descriptionEn: parsed.description_en,
        priceMonthly: parsed.price_monthly, durationDays: parsed.duration_days,
        maxPatients: parsed.max_patients, maxAiCallsMonthly: parsed.max_ai_calls_monthly,
        features: parsed.features, isActive: true, sortOrder: parsed.sort_order,
      });
      created++;
      log(`  plan "${plan.key}"            -> created ${id}`);
    }
  }
}

/** @returns map of name_en -> food row (id + macros) for template snapshots. */
async function seedFoods(): Promise<Map<string, { id: string; protein: number; carbs: number; fats: number; category: string | null; tags: string[] }>> {
  const out = new Map<string, { id: string; protein: number; carbs: number; fats: number; category: string | null; tags: string[] }>();
  const existing = await foodsRepository.listGlobalNames();

  for (const food of SEED_FOODS) {
    const kcal = kcalFromMacros(food.protein, food.carbs, food.fats);
    const payload = {
      name_ar: food.name_ar,
      name_en: food.name_en,
      calories_per_100g: kcal,
      protein_per_100g: food.protein,
      carbs_per_100g: food.carbs,
      fats_per_100g: food.fats,
      category: food.category,
      tags: food.tags,
      pairing_tags: null,
    };
    const match = existing.find((n) => n.name_en === food.name_en || n.name_ar === food.name_ar);
    if (match) {
      // foodsService.update runs the same consistency gate as create.
      const list = await foodsRepository.listGlobalNames();
      const row = (await foodsRepository.listForAdmin('seed', { search: food.name_ar, page: 1, limit: 5 }));
      void list;
      const hit = row.items.find((i) => i.name_en === food.name_en);
      if (hit) {
        if (!DRY) {
          await foodsService.update(hit.id, 'seed', payload, true);
        }
        updated++;
        log(`  food "${food.name_en}"  -> updated`);
        out.set(food.name_en, {
          id: hit.id, protein: hit.protein_per_100g, carbs: hit.carbs_per_100g,
          fats: hit.fats_per_100g, category: hit.category, tags: hit.tags ?? [],
        });
        continue;
      }
    }
    const id = DRY
      ? '(dry-run)'
      : await foodsService.create('seed', payload as never, true);
    created++;
    log(`  food "${food.name_en}"  -> created`);
    out.set(food.name_en, {
      id, protein: food.protein, carbs: food.carbs, fats: food.fats,
      category: food.category, tags: food.tags,
    });
  }
  return out;
}

async function seedPosts(): Promise<void> {
  const createdIds = new Map<string, string>();
  for (const post of SEED_POSTS) {
    const parsed = postCreateSchema.parse({
      locale: post.locale,
      title: post.title,
      slug: post.slug,
      excerpt: post.excerpt,
      content_md: post.content_md,
      meta_title: post.meta_title,
      meta_desc: post.meta_desc,
      guest_author: post.guest_author,
      published_at: post.published_at,
      send_newsletter: false, // staging demo: never touch the newsletter queue
    });

    const translationOf = post.translationSlug ? createdIds.get(post.translationSlug) : undefined;
    const slug = parsed.slug ?? '';

    if (slug && (await blogAdminRepository.slugExists(slug, parsed.locale))) {
      // Already seeded: refresh the body in place rather than duplicating.
      const listed = await blogAdminRepository.list({ q: slug, page: 1, limit: 10 });
      const match = listed.posts.find((p) => p.slug === slug && p.locale === parsed.locale);
      const found = match ? await blogAdminRepository.findById(match.id) : null;
      if (found && match) {
        if (!DRY) {
          await postsService.update('seed', match.id, {
            title: parsed.title,
            excerpt: parsed.excerpt,
            content_md: parsed.content_md,
            meta_title: parsed.meta_title,
            meta_desc: parsed.meta_desc,
            translation_of: translationOf ?? null,
          });
          if (found.status !== 'published') {
            await postsService.publish('seed', match.id, post.published_at);
          }
        }
        updated++;
        createdIds.set(post.slug, match.id);
        log(`  post ${post.locale}/${post.slug} -> updated`);
        continue;
      }
    }

    // author_id is NULL-able (FK ON DELETE SET NULL) and the byline is carried
    // by guest_author, so no User row is created. See PR privacy note above.
    const { id } = DRY
      ? { id: '(dry-run)' }
      : await postsService.create(null as unknown as string, { ...parsed, translation_of: translationOf ?? null });
    if (!DRY) {
      await postsService.publish('seed', id, post.published_at);
    }
    created++;
    createdIds.set(post.slug, id);
    log(`  post ${post.locale}/${post.slug} -> created`);
  }
}

async function seedTemplates(
  foods: Map<string, { id: string; protein: number; carbs: number; fats: number; category: string | null; tags: string[] }>,
): Promise<void> {
  const existing = await templatesRepository.listVisible('seed', {});
  const byName = new Map(existing.map((t) => [t.name, t]));

  for (const tpl of SEED_TEMPLATES) {
    const days = tpl.days.map((d) => ({
      day: d.day,
      meals: d.meals.map((m) => ({
        mealName: m.mealName,
        items: m.items.map((i: TemplateFoodRef) => {
          const f = foods.get(i.key);
          if (!f) throw new Error(`template "${tpl.name}" references unfood "${i.key}"`);
          return {
            foodId: f.id === '(dry-run)' ? null : f.id,
            nameAr: f.id === '(dry-run)' ? i.key : i.key,
            nameEn: i.key,
            source: 'db' as const,
            grams: i.grams,
            per100: { kcal: kcalFromMacros(f.protein, f.carbs, f.fats), protein: f.protein, carbs: f.carbs, fats: f.fats },
            category: f.category,
            tags: f.tags,
          };
        }),
      })),
    }));

    const snapshot = { version: 1 as const, sourcePlanId: 'seed-demo', days, reference: tpl.reference };
    const payload = {
      id: randomUUID(),
      ownerId: null,
      isGlobal: true,
      templateType: 'nutrition' as const,
      category: tpl.category,
      name: tpl.name,
      description: tpl.description,
      snapshot,
      referenceCalories: tpl.reference.calories,
      referenceProteinG: tpl.reference.proteinG,
      referenceCarbsG: tpl.reference.carbsG,
      referenceFatsG: tpl.reference.fatsG,
    };

    const found = byName.get(tpl.name);
    if (found) {
      if (!DRY) {
        await templatesRepository.updateById(found.id, {
          name: tpl.name, category: tpl.category, description: tpl.description,
        });
      }
      updated++;
      log(`  template "${tpl.name}" -> updated`);
      continue;
    }
    if (!DRY) await templatesRepository.insert(payload);
    created++;
    log(`  template "${tpl.name}" -> created`);
  }
}

const COUNT_TABLES: Array<[string, string]> = [
  ['SubscriptionPlan', 'pricing plans'],
  ['FoodItem', 'food items'],
  ['PlanTemplate', 'plan templates'],
  ['BlogPost', 'blog posts (all statuses)'],
  ['BlogRevision', 'blog revisions'],
];

async function verify(): Promise<void> {
  log('\n--- row counts -------------------------------------------------');
  for (const [table, label] of COUNT_TABLES) {
    // eslint-disable-next-line no-restricted-syntax -- table names are a fixed allowlist above (D-01)
    const rows = await executeQuery<Array<{ c: number }>>(`SELECT COUNT(*) as c FROM \`${table}\``);
    log(`  ${table.padEnd(18)} ${String(rows[0]?.c ?? 0).padStart(5)}   ${label}`);
  }
  const pub = await executeQuery<Array<{ c: number }>>(
    "SELECT COUNT(*) as c FROM BlogPost WHERE status = 'published'"
  );
  log(`  ${'BlogPost(published)'.padEnd(18)} ${String(pub[0]?.c ?? 0).padStart(5)}   visible on the blog`);

  log('\n--- privacy check: these MUST stay empty --------------------');
  const PRIVATE: Array<[string, string]> = [
    ['User', 'doctor accounts'],
    ['Patient', 'patient records'],
    ['NutritionPlan', 'patient nutrition plans'],
    ['ExercisePlan', 'patient exercise plans'],
    ['Subscription', 'billing subscriptions'],
    ['AuditLog', 'audit trail'],
  ];
  let leaked = 0;
  for (const [table, label] of PRIVATE) {
    // eslint-disable-next-line no-restricted-syntax -- table names are a fixed allowlist above (D-01)
    const rows = await executeQuery<Array<{ c: number }>>(`SELECT COUNT(*) as c FROM \`${table}\``);
    const c = Number(rows[0]?.c ?? 0);
    if (c > 0) leaked++;
    log(`  ${table.padEnd(18)} ${String(c).padStart(5)}   ${label}${c > 0 ? '  <-- NON-ZERO' : ''}`);
  }
  if (leaked > 0) log(`\n  WARNING: ${leaked} private table(s) are not empty.`);
}

async function main(): Promise<void> {
  log(`P32-SEED demo content seed  (${DRY ? 'DRY RUN' : VERIFY_ONLY ? 'VERIFY ONLY' : 'WRITE'})`);
  log(`database: ${process.env.DATABASE_NAME} @ ${process.env.DATABASE_HOST}\n`);

  if (VERIFY_ONLY) {
    await withRetry('verify (row counts)', verify);
    return;
  }

  log('1/4 pricing plans');
  await withRetry('seedPlans (pricing plans)', seedPlans);

  log('\n2/4 foods');
  const foods = await withRetry('seedFoods (food items)', seedFoods);

  log('\n3/4 blog posts');
  await withRetry('seedPosts (blog posts)', seedPosts);

  log('\n4/4 plan templates');
  await withRetry('seedTemplates (plan templates)', () => seedTemplates(foods));

  log(`\ncreated ${created}, updated ${updated}, skipped ${skipped}`);

  log('\nNOT seeded (see tech-debt ledger):');
  for (const line of SEED_EXERCISE_DEBT) log('  - ' + line);
  log('NOT seeded: CmsContent legal pages — no repository insert path exists;');
  log('  lib/cms/legal.ts already serves bilingual statutory defaults.');

  await withRetry('verify (row counts)', verify);
}

// Close the seed pool explicitly so a keep-alive socket never holds the
// process open, then exit.
main()
  .then(async () => {
    await closeDbPool().catch(() => undefined);
    process.exit(0);
  })
  .catch(async (err: unknown) => {
    // withRetry already printed the full diagnostic for DB failures; this is
    // the last-resort handler for anything thrown outside a retried block.
    if (!isConnectionError(err)) {
      reportFailure('seed-demo (unhandled)', err);
    }
    await closeDbPool().catch(() => undefined);
    process.exit(1);
  });