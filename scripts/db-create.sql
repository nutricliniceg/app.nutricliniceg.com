-- P32: fresh databases for the app.nutricliniceg.com deployment.
-- Run in phpMyAdmin (SQL tab) or via cPanel MySQL wizard.
-- cPanel prefixes every name with your account username + underscore,
-- e.g. account `nutriapp` + `nutriapp_prod` => `nutriapp_nutriapp_prod`.
-- These names NEVER collide with existing databases: nothing is
-- altered or dropped here — CREATE only.
--
-- 1) Create the three databases (adjust the prefix to your account):
CREATE DATABASE IF NOT EXISTS `nutriapp_prod` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS `nutriapp_stage` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE IF NOT EXISTS `nutriapp_verify` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 2) Create one dedicated MySQL user per environment (least privilege):
-- CREATE USER IF NOT EXISTS 'nutri_prod'@'localhost' IDENTIFIED BY 'REPLACE_WITH_STRONG_PASSWORD';
-- CREATE USER IF NOT EXISTS 'nutri_stage'@'localhost' IDENTIFIED BY 'REPLACE_WITH_STRONG_PASSWORD';
-- GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES ON `nutriapp_prod`.* TO 'nutri_prod'@'localhost';
-- GRANT ALL PRIVILEGES ON `nutriapp_stage`.* TO 'nutri_stage'@'localhost';
-- GRANT ALL PRIVILEGES ON `nutriapp_verify`.* TO 'nutri_stage'@'localhost';
-- FLUSH PRIVILEGES;

-- 3) After creating, load the schema into each DB:
--      mysql -u <user> -p <db> < prisma/schema.sql
--    (run from your local machine over the schema file in this repo,
--    or paste prisma/schema.sql content into phpMyAdmin per database).
--    Then run ALTERs listed at the top of PROGRESS.md "DB Migrations Applied"
--    if your schema.sql copy predates them — see docs/deploy-runbook.md.
