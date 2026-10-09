const fs = require("fs");
const src = fs.readFileSync("prisma/schema.sql", "utf8");
const lines = src.split(/\r?\n/).filter((l) => {
  const t = l.trim().toUpperCase();
  if (t.startsWith("CREATE DATABASE")) return false;
  if (/^USE\s+`?[\w$]+`?\s*;?\s*$/.test(t)) return false;
  return true;
});
let out = lines.join("\n");
// strip any db-qualified names `db`.`tbl` -> `tbl` (defensive; schema uses plain names)
out = out.replace(/`[A-Za-z0-9_$]+`\s*\.\s*`/g, "`");
const header = `-- NutriClinicEG — cPanel-safe schema import (PROMPT: cpanel db-create rewrite).
-- HOW TO USE: in phpMyAdmin select the target DB first
--   (nutrvbis_nutriapp_prod | nutrvbis_nutriapp_stage | nutrvbis_nutriapp_verify),
-- then Import this file. No CREATE DATABASE / USE inside (shared hosting forbids it).
-- Databases are created via the cPanel UI only. Re-importing is safe (IF NOT EXISTS).
-- CONTENTS: full PRD schema (mirrors prisma/schema.sql) + schema_migrations +
-- allergy_synonyms + food_requests (FoodRequest) + revoked_tokens alias (RevokedToken).
--
`;
const extra = `
-- schema_migrations: migration ledger (scripts/migrate.ts records here).
CREATE TABLE IF NOT EXISTS schema_migrations (
    filename VARCHAR(255) PRIMARY KEY,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- allergy_synonyms: admin-managed allergen synonym map (NUT-02).
-- Canonical allergen -> JSON array of synonyms (ar/en).
CREATE TABLE IF NOT EXISTS allergy_synonyms (
    id VARCHAR(36) PRIMARY KEY,
    allergen VARCHAR(120) NOT NULL UNIQUE,
    synonyms JSON NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- revoked_tokens alias: lowercase snake_case alias of RevokedToken for
-- middleware/queries that reference revoked_tokens (AUTH-08/14).
-- Kept in sync by app code writing to both; identical shape to RevokedToken.
CREATE TABLE IF NOT EXISTS revoked_tokens (
    jti VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES User(id) ON DELETE CASCADE,
    INDEX idx_user (user_id),
    INDEX idx_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
`;
fs.writeFileSync("scripts/db-create.sql", header + out.replace(/^-- MySQL.*\n-- NutriClinicEG.*\n-- Complete.*\n/, "") + extra);
console.log("wrote scripts/db-create.sql bytes=" + fs.statSync("scripts/db-create.sql").size);
