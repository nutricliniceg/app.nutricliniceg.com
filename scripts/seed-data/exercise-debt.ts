// P32-SEED — exercise seeding is deliberately NOT implemented.
//
// The schema has no exercise CATALOG table. The only exercise tables are:
//
//   ExercisePlan         (patient_id -> Patient, doctor_id -> User)
//   ExercisePlanDay      (plan_id -> ExercisePlan)
//   ExercisePlanExercise (day_id -> ExercisePlanDay)
//
// So there is nowhere to put 15 standalone exercises without first creating a
// User and a Patient, which P32-SEED explicitly forbids ("DO NOT touch: users,
// patients, plans"). Adding a catalog table would be a schema change, also
// forbidden. Rows placed here would therefore be unreachable demo PHI-shaped
// rows in the exact tables privacy-by-design keeps empty.
//
// Tracked as a P33 tech-debt item: add ExerciseCatalog (name_ar, name_en,
// category, default sets/reps/rest, youtube_url) + an admin screen, then seed
// from it. See PROGRESS.md -> TECH DEBT LEDGER.
export const SEED_EXERCISE_DEBT: string[] = [
  '15 exercises — no exercise catalog table exists (see this file)',
];