-- MySQL 8.0 Schema DDL
-- NutriClinicEG - PRD §9
-- Complete 39-table schema per PRD v3.8

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- 1) User (doctors, admins, super_admins)
CREATE TABLE IF NOT EXISTS User (
    id VARCHAR(36) PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(30) NULL,
    role ENUM('doctor','admin','super_admin') NOT NULL DEFAULT 'doctor',
    clinic_name VARCHAR(255) NULL,
    clinic_logo_url VARCHAR(500) NULL,
    specialization VARCHAR(255) NULL,
    avatar_url VARCHAR(500) NULL,
    preferred_locale VARCHAR(5) NOT NULL DEFAULT 'ar',
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    email_verified_at TIMESTAMP NULL,
    subscription_plan_id VARCHAR(36) NULL,
    subscription_ends_at TIMESTAMP NULL,
    trial_ends_at TIMESTAMP NULL,
    password_changed_at TIMESTAMP NULL,
    org_id VARCHAR(36) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_email (email),
    INDEX idx_role (role),
    INDEX idx_org_id (org_id),
    INDEX idx_subscription_plan (subscription_plan_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2) SubscriptionPlan
CREATE TABLE IF NOT EXISTS SubscriptionPlan (
    id VARCHAR(36) PRIMARY KEY,
    name_ar VARCHAR(100) NOT NULL,
    name_en VARCHAR(100) NOT NULL,
    description_ar TEXT NULL,
    description_en TEXT NULL,
    price_monthly DECIMAL(10,2) NOT NULL,
    price_yearly DECIMAL(10,2) NULL,
    duration_days INT NOT NULL,
    max_patients INT NULL,
    max_ai_calls_monthly INT NULL,
    features JSON NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3) Subscription
CREATE TABLE IF NOT EXISTS Subscription (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    plan_id VARCHAR(36) NOT NULL,
    status ENUM('trial','active','grace','expired','cancelled','pending_payment') NOT NULL DEFAULT 'trial',
    payment_method ENUM('paymob','manual','bank_transfer') NULL,
    payment_reference VARCHAR(255) NULL,
    reminder_7d_sent BOOLEAN NOT NULL DEFAULT FALSE,
    reminder_3d_sent BOOLEAN NOT NULL DEFAULT FALSE,
    reminder_0d_sent BOOLEAN NOT NULL DEFAULT FALSE,
    auto_renew BOOLEAN NOT NULL DEFAULT TRUE,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ends_at TIMESTAMP NOT NULL,
    cancelled_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES User(id) ON DELETE CASCADE,
    FOREIGN KEY (plan_id) REFERENCES SubscriptionPlan(id) ON DELETE RESTRICT,
    INDEX idx_user_status (user_id, status),
    INDEX idx_ends_at (ends_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4) Patient
CREATE TABLE IF NOT EXISTS Patient (
    id VARCHAR(36) PRIMARY KEY,
    doctor_id VARCHAR(36) NOT NULL,
    name_ar VARCHAR(255) NOT NULL,
    name_en VARCHAR(255) NULL,
    gender ENUM('male','female') NOT NULL,
    birth_date DATE NOT NULL,
    height_cm INT NOT NULL,
    initial_weight_kg DECIMAL(5,2) NOT NULL,
    current_weight_kg DECIMAL(5,2) NULL,
    activity_level ENUM('sedentary','light','moderate','active','very_active') NOT NULL,
    goal ENUM('lose','maintain','gain') NOT NULL,
    medical_notes TEXT NULL,
    chronic_conditions JSON NULL,
    allergies JSON NULL,
    consent_ai_sharing_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (doctor_id) REFERENCES User(id) ON DELETE CASCADE,
    INDEX idx_doctor (doctor_id),
    INDEX idx_name_ar (name_ar)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 5) PatientShareToken
CREATE TABLE IF NOT EXISTS PatientShareToken (
    id VARCHAR(36) PRIMARY KEY,
    patient_id VARCHAR(36) NOT NULL,
    permissions JSON NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    revoked_at TIMESTAMP NULL,
    access_count INT DEFAULT 0,
    last_accessed_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES Patient(id) ON DELETE CASCADE,
    INDEX idx_patient (patient_id),
    INDEX idx_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 6) Visit
CREATE TABLE IF NOT EXISTS Visit (
    id VARCHAR(36) PRIMARY KEY,
    patient_id VARCHAR(36) NOT NULL,
    doctor_id VARCHAR(36) NOT NULL,
    visit_date DATE NOT NULL,
    weight_kg DECIMAL(5,2) NULL,
    body_fat_pct DECIMAL(5,2) NULL,
    muscle_mass_kg DECIMAL(5,2) NULL,
    water_pct DECIMAL(5,2) NULL,
    notes TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES Patient(id) ON DELETE CASCADE,
    FOREIGN KEY (doctor_id) REFERENCES User(id) ON DELETE CASCADE,
    INDEX idx_patient_date (patient_id, visit_date),
    INDEX idx_doctor_date (doctor_id, visit_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 7) NutritionPlan
CREATE TABLE IF NOT EXISTS NutritionPlan (
    id VARCHAR(36) PRIMARY KEY,
    patient_id VARCHAR(36) NOT NULL,
    doctor_id VARCHAR(36) NOT NULL,
    week_number INT NOT NULL DEFAULT 1,
    status ENUM('draft','pending_doctor_approval','active','archived') NOT NULL DEFAULT 'draft',
    generation_mode ENUM('from_list','ai_free') NOT NULL DEFAULT 'from_list',
    target_calories INT NOT NULL,
    target_protein_g INT NOT NULL,
    target_carbs_g INT NOT NULL,
    target_fats_g INT NOT NULL,
    reconciled_total_calories INT NULL,
    reconciled_protein_g INT NULL,
    reconciled_carbs_g INT NULL,
    reconciled_fats_g INT NULL,
    deviation_kcal INT NULL,
    values_unverified BOOLEAN NOT NULL DEFAULT FALSE,
    verified_items_ratio DECIMAL(5,2) NULL,
    verification_report JSON NULL,
    approved_by VARCHAR(36) NULL,
    approved_at TIMESTAMP NULL,
    reconciled_at TIMESTAMP NULL,
    -- P18 Q2 (owner decision pending): patient-facing calorie visibility, default visible.
    show_calories_to_patient BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES Patient(id) ON DELETE CASCADE,
    FOREIGN KEY (doctor_id) REFERENCES User(id) ON DELETE CASCADE,
    FOREIGN KEY (approved_by) REFERENCES User(id) ON DELETE SET NULL,
    INDEX idx_patient_status (patient_id, status),
    INDEX idx_doctor_status (doctor_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 8) NutritionPlanMeal
CREATE TABLE IF NOT EXISTS NutritionPlanMeal (
    id VARCHAR(36) PRIMARY KEY,
    plan_id VARCHAR(36) NOT NULL,
    day_of_week TINYINT NOT NULL,
    meal_name ENUM('Breakfast','Morning Snack','Lunch','Evening Snack','Dinner') NOT NULL,
    culinary_pairings_valid BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (plan_id) REFERENCES NutritionPlan(id) ON DELETE CASCADE,
    INDEX idx_plan_day (plan_id, day_of_week)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 9) NutritionPlanMealItem
CREATE TABLE IF NOT EXISTS NutritionPlanMealItem (
    id VARCHAR(36) PRIMARY KEY,
    meal_id VARCHAR(36) NOT NULL,
    food_id VARCHAR(36) NULL,
    food_name_ar VARCHAR(255) NOT NULL,
    food_name_en VARCHAR(255) NULL,
    source ENUM('db','model') NOT NULL DEFAULT 'db',
    grams DECIMAL(8,2) NOT NULL,
    protein_g DECIMAL(8,2) NOT NULL,
    carbs_g DECIMAL(8,2) NOT NULL,
    fats_g DECIMAL(8,2) NOT NULL,
    calories DECIMAL(8,2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (meal_id) REFERENCES NutritionPlanMeal(id) ON DELETE CASCADE,
    FOREIGN KEY (food_id) REFERENCES FoodItem(id) ON DELETE RESTRICT,
    INDEX idx_meal (meal_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 10) ExercisePlan
CREATE TABLE IF NOT EXISTS ExercisePlan (
    id VARCHAR(36) PRIMARY KEY,
    patient_id VARCHAR(36) NOT NULL,
    doctor_id VARCHAR(36) NOT NULL,
    week_number INT NOT NULL DEFAULT 1,
    status ENUM('draft','pending_doctor_approval','active','archived') NOT NULL DEFAULT 'draft',
    approved_by VARCHAR(36) NULL,
    approved_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES Patient(id) ON DELETE CASCADE,
    FOREIGN KEY (doctor_id) REFERENCES User(id) ON DELETE CASCADE,
    FOREIGN KEY (approved_by) REFERENCES User(id) ON DELETE SET NULL,
    INDEX idx_patient_status (patient_id, status),
    INDEX idx_doctor_status (doctor_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 11) ExercisePlanDay
CREATE TABLE IF NOT EXISTS ExercisePlanDay (
    id VARCHAR(36) PRIMARY KEY,
    plan_id VARCHAR(36) NOT NULL,
    day_of_week TINYINT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (plan_id) REFERENCES ExercisePlan(id) ON DELETE CASCADE,
    INDEX idx_plan_day (plan_id, day_of_week)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 12) ExercisePlanExercise
CREATE TABLE IF NOT EXISTS ExercisePlanExercise (
    id VARCHAR(36) PRIMARY KEY,
    day_id VARCHAR(36) NOT NULL,
    name_ar VARCHAR(255) NOT NULL,
    name_en VARCHAR(255) NULL,
    sets INT NOT NULL,
    reps INT NOT NULL,
    rest_seconds INT NULL,
    youtube_url VARCHAR(500) NULL,
    notes TEXT NULL,
    order_index INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (day_id) REFERENCES ExercisePlanDay(id) ON DELETE CASCADE,
    INDEX idx_day_order (day_id, order_index)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 13) FoodItem
CREATE TABLE IF NOT EXISTS FoodItem (
    id VARCHAR(36) PRIMARY KEY,
    name_ar VARCHAR(255) NOT NULL,
    name_en VARCHAR(255) NULL,
    calories_per_100g DECIMAL(8,2) NOT NULL,
    protein_per_100g DECIMAL(8,2) NOT NULL,
    carbs_per_100g DECIMAL(8,2) NOT NULL,
    fats_per_100g DECIMAL(8,2) NOT NULL,
    potassium_mg_per_100g DECIMAL(8,2) NULL,
    phosphorus_mg_per_100g DECIMAL(8,2) NULL,
    sodium_mg_per_100g DECIMAL(8,2) NULL,
    added_sugar_g_per_100g DECIMAL(8,2) NULL,
    category VARCHAR(50) NULL,
    tags JSON NULL,
    pairing_tags JSON NULL,
    is_verified BOOLEAN NOT NULL DEFAULT FALSE,
    owner_id VARCHAR(36) NULL,
    org_id VARCHAR(36) NULL,
    archived BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_id) REFERENCES User(id) ON DELETE SET NULL,
    FOREIGN KEY (org_id) REFERENCES User(id) ON DELETE SET NULL,
    INDEX idx_category (category),
    INDEX idx_owner (owner_id),
    INDEX idx_org (org_id),
    INDEX idx_verified (is_verified)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 14) FoodList
CREATE TABLE IF NOT EXISTS FoodList (
    id VARCHAR(36) PRIMARY KEY,
    name_ar VARCHAR(255) NOT NULL,
    name_en VARCHAR(255) NULL,
    description_ar TEXT NULL,
    description_en TEXT NULL,
    owner_id VARCHAR(36) NULL,
    org_id VARCHAR(36) NULL,
    is_global BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_id) REFERENCES User(id) ON DELETE SET NULL,
    FOREIGN KEY (org_id) REFERENCES User(id) ON DELETE SET NULL,
    INDEX idx_owner (owner_id),
    INDEX idx_global (is_global)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 15) FoodListItem
CREATE TABLE IF NOT EXISTS FoodListItem (
    id VARCHAR(36) PRIMARY KEY,
    list_id VARCHAR(36) NOT NULL,
    food_id VARCHAR(36) NOT NULL,
    order_index INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (list_id) REFERENCES FoodList(id) ON DELETE CASCADE,
    FOREIGN KEY (food_id) REFERENCES FoodItem(id) ON DELETE CASCADE,
    UNIQUE KEY uq_list_food (list_id, food_id),
    INDEX idx_list_order (list_id, order_index)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 16) AiProvider
CREATE TABLE IF NOT EXISTS AiProvider (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    type ENUM('openai','gemini','anthropic','custom') NOT NULL,
    base_url VARCHAR(500) NULL,
    priority_order INT NOT NULL DEFAULT 0,
    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    failure_count INT DEFAULT 0,
    disabled_until TIMESTAMP NULL,
    supports_vision BOOLEAN NOT NULL DEFAULT FALSE,
    supports_json_mode BOOLEAN NOT NULL DEFAULT TRUE,
    data_retention ENUM('unknown','zero-retention','training-opt-out') NOT NULL DEFAULT 'unknown' COMMENT 'CMP-10: patient data blocked unless recorded non-unknown',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_priority (priority_order),
    INDEX idx_enabled (is_enabled)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 17) AiApiKey
CREATE TABLE IF NOT EXISTS AiApiKey (
    id VARCHAR(36) PRIMARY KEY,
    provider_id VARCHAR(36) NOT NULL,
    key_encrypted TEXT NOT NULL,
    key_hint VARCHAR(20) NOT NULL,
    name VARCHAR(100) NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    last_used_at TIMESTAMP NULL,
    last_rotated_at TIMESTAMP NULL,
    monthly_quota INT NULL,
    current_month_usage INT DEFAULT 0,
    usage_reset_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (provider_id) REFERENCES AiProvider(id) ON DELETE CASCADE,
    INDEX idx_provider_active (provider_id, is_active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 18) AiUsageLog
CREATE TABLE IF NOT EXISTS AiUsageLog (
    id VARCHAR(36) PRIMARY KEY,
    provider_id VARCHAR(36) NOT NULL,
    api_key_id VARCHAR(36) NULL,
    doctor_id VARCHAR(36) NULL,
    prompt_tokens INT NOT NULL,
    completion_tokens INT NOT NULL,
    total_tokens INT NOT NULL,
    estimated_cost DECIMAL(10,6) NOT NULL,
    response_time_ms INT NOT NULL,
    success BOOLEAN NOT NULL,
    error_message TEXT NULL,
    request_type VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (provider_id) REFERENCES AiProvider(id) ON DELETE CASCADE,
    FOREIGN KEY (api_key_id) REFERENCES AiApiKey(id) ON DELETE SET NULL,
    FOREIGN KEY (doctor_id) REFERENCES User(id) ON DELETE SET NULL,
    INDEX idx_doctor_date (doctor_id, created_at),
    INDEX idx_provider_date (provider_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 19) AiConversation
CREATE TABLE IF NOT EXISTS AiConversation (
    id VARCHAR(36) PRIMARY KEY,
    doctor_id VARCHAR(36) NOT NULL,
    patient_id VARCHAR(36) NULL,
    title VARCHAR(255) NULL,
    is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
    is_archived BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (doctor_id) REFERENCES User(id) ON DELETE CASCADE,
    FOREIGN KEY (patient_id) REFERENCES Patient(id) ON DELETE SET NULL,
    INDEX idx_doctor_active (doctor_id, is_archived, deleted_at),
    INDEX idx_patient (patient_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 20) AiMessage
CREATE TABLE IF NOT EXISTS AiMessage (
    id VARCHAR(36) PRIMARY KEY,
    conversation_id VARCHAR(36) NOT NULL,
    role ENUM('system','user','assistant') NOT NULL,
    content TEXT NOT NULL,
    attachments JSON NULL,
    tokens_used INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (conversation_id) REFERENCES AiConversation(id) ON DELETE CASCADE,
    INDEX idx_conversation_created (conversation_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 21) CmsContent (static pages only, not blog)
CREATE TABLE IF NOT EXISTS CmsContent (
    id VARCHAR(36) PRIMARY KEY,
    slug VARCHAR(200) NOT NULL UNIQUE,
    title_ar VARCHAR(255) NOT NULL,
    title_en VARCHAR(255) NULL,
    content_ar LONGTEXT NOT NULL,
    content_en LONGTEXT NULL,
    meta_title_ar VARCHAR(60) NULL,
    meta_title_en VARCHAR(60) NULL,
    meta_desc_ar VARCHAR(160) NULL,
    meta_desc_en VARCHAR(160) NULL,
    is_published BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_published (is_published)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 22) LandingPageSection
CREATE TABLE IF NOT EXISTS LandingPageSection (
    id VARCHAR(36) PRIMARY KEY,
    key_name VARCHAR(100) NOT NULL UNIQUE,
    title_ar VARCHAR(255) NULL,
    title_en VARCHAR(255) NULL,
    is_visible BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 23) LandingPageItem
CREATE TABLE IF NOT EXISTS LandingPageItem (
    id VARCHAR(36) PRIMARY KEY,
    section_id VARCHAR(36) NOT NULL,
    type ENUM('feature','testimonial','faq','pricing','cta') NOT NULL,
    content_ar JSON NOT NULL,
    content_en JSON NULL,
    is_visible BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (section_id) REFERENCES LandingPageSection(id) ON DELETE CASCADE,
    INDEX idx_section_order (section_id, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 24) SystemSettings
CREATE TABLE IF NOT EXISTS SystemSettings (
    `key` VARCHAR(100) PRIMARY KEY,
    value JSON NOT NULL,
    description TEXT NULL,
    is_sensitive BOOLEAN NOT NULL DEFAULT FALSE,
    updated_by VARCHAR(36) NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (updated_by) REFERENCES User(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 25) SiteVisitor
CREATE TABLE IF NOT EXISTS SiteVisitor (
    id VARCHAR(36) PRIMARY KEY,
    ip_hash VARCHAR(64) NOT NULL,
    last_path VARCHAR(500) NULL,
    referrer VARCHAR(500) NULL,
    visit_count INT DEFAULT 1,
    first_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_seen_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_ip_hash (ip_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 26) SystemErrorLog
CREATE TABLE IF NOT EXISTS SystemErrorLog (
    id VARCHAR(36) PRIMARY KEY,
    level ENUM('error','warning','info') NOT NULL,
    source VARCHAR(100) NOT NULL,
    message TEXT NOT NULL,
    stack TEXT NULL,
    path VARCHAR(500) NULL,
    user_id VARCHAR(36) NULL,
    sentry_id VARCHAR(100) NULL,
    resolved_at TIMESTAMP NULL,
    resolution_note TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES User(id) ON DELETE SET NULL,
    INDEX idx_level_created (level, created_at),
    INDEX idx_resolved (resolved_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 27) VerificationCode
CREATE TABLE IF NOT EXISTS VerificationCode (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    code VARCHAR(6) NOT NULL,
    type ENUM('email_verification','password_reset') NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    used_at TIMESTAMP NULL,
    attempts INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES User(id) ON DELETE CASCADE,
    INDEX idx_user_type (user_id, type),
    INDEX idx_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 28) RevokedToken (for session invalidation)
CREATE TABLE IF NOT EXISTS RevokedToken (
    jti VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES User(id) ON DELETE CASCADE,
    INDEX idx_user (user_id),
    INDEX idx_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 29) AuditLog
CREATE TABLE IF NOT EXISTS AuditLog (
    id VARCHAR(36) PRIMARY KEY,
    actor_id VARCHAR(36) NULL,
    actor_role VARCHAR(20) NOT NULL,
    action VARCHAR(60) NOT NULL,
    entity_type VARCHAR(40) NOT NULL,
    entity_id VARCHAR(36) NULL,
    ip_hash VARCHAR(64) NULL,
    user_agent VARCHAR(255) NULL,
    metadata JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_entity (entity_type, entity_id),
    INDEX idx_actor (actor_id, created_at),
    INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 30) Notification
CREATE TABLE IF NOT EXISTS Notification (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    title VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    type VARCHAR(50) NOT NULL,
    link VARCHAR(255) NULL,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES User(id) ON DELETE CASCADE,
    INDEX idx_user_unread (user_id, is_read),
    INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 31) PatientMessage
CREATE TABLE IF NOT EXISTS PatientMessage (
    id VARCHAR(36) PRIMARY KEY,
    patient_id VARCHAR(36) NOT NULL,
    doctor_id VARCHAR(36) NOT NULL,
    sender_type ENUM('patient','doctor') NOT NULL,
    message_type ENUM('text','image','weight_log','measurement_log','note') NOT NULL DEFAULT 'text',
    message_text TEXT NULL,
    attachment_url TEXT NULL,
    payload_json JSON NULL,
    is_read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMP NULL,
    archived BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES Patient(id) ON DELETE CASCADE,
    FOREIGN KEY (doctor_id) REFERENCES User(id) ON DELETE CASCADE,
    INDEX idx_thread (patient_id, doctor_id, created_at),
    INDEX idx_doctor_unread (doctor_id, is_read)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 32) AdminMessage
CREATE TABLE IF NOT EXISTS AdminMessage (
    id VARCHAR(36) PRIMARY KEY,
    sender_id VARCHAR(36) NULL,
    sender_alias VARCHAR(100) NOT NULL,
    recipient_type ENUM('all','doctors','selected','admins') NOT NULL,
    subject VARCHAR(255) NOT NULL,
    body_content TEXT NOT NULL,
    send_via_email BOOLEAN DEFAULT TRUE,
    send_via_in_app BOOLEAN DEFAULT TRUE,
    sent_count INT DEFAULT 0,
    failed_count INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (sender_id) REFERENCES User(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 33) AdminMessageRecipient
CREATE TABLE IF NOT EXISTS AdminMessageRecipient (
    id VARCHAR(36) PRIMARY KEY,
    message_id VARCHAR(36) NOT NULL,
    user_id VARCHAR(36) NOT NULL,
    email_status ENUM('pending','sent','failed') DEFAULT 'pending',
    error_message TEXT NULL,
    sent_at TIMESTAMP NULL,
    FOREIGN KEY (message_id) REFERENCES AdminMessage(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES User(id) ON DELETE CASCADE,
    INDEX idx_message (message_id),
    INDEX idx_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 34) PlanRevision
CREATE TABLE IF NOT EXISTS PlanRevision (
    id VARCHAR(36) PRIMARY KEY,
    plan_type ENUM('nutrition','exercise') NOT NULL,
    plan_id VARCHAR(36) NOT NULL,
    revision_no INT NOT NULL,
    snapshot JSON NOT NULL,
    changed_by VARCHAR(36) NOT NULL,
    change_note VARCHAR(255) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (changed_by) REFERENCES User(id) ON DELETE CASCADE,
    INDEX idx_plan (plan_type, plan_id, revision_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 35) BlogPost
CREATE TABLE IF NOT EXISTS BlogPost (
    id VARCHAR(36) PRIMARY KEY,
    author_id VARCHAR(36) NULL,
    locale VARCHAR(5) NOT NULL DEFAULT 'ar',
    translation_of VARCHAR(36) NULL,
    slug VARCHAR(200) NOT NULL,
    title VARCHAR(255) NOT NULL,
    excerpt VARCHAR(400) NULL,
    content_md LONGTEXT NOT NULL,
    content_html LONGTEXT NULL,
    featured_image VARCHAR(500) NULL,
    category_id VARCHAR(36) NULL,
    status ENUM('draft','scheduled','published','archived') NOT NULL DEFAULT 'draft',
    meta_title VARCHAR(60) NULL,
    meta_desc VARCHAR(160) NULL,
    og_image VARCHAR(500) NULL,
    canonical_url VARCHAR(500) NULL,
    noindex BOOLEAN DEFAULT FALSE,
    guest_author VARCHAR(255) NULL,
    reading_minutes INT DEFAULT 1,
    view_count INT DEFAULT 0,
    send_newsletter BOOLEAN DEFAULT TRUE,
    newsletter_sent_at TIMESTAMP NULL,
    published_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_slug_locale (slug, locale),
    FOREIGN KEY (author_id) REFERENCES User(id) ON DELETE SET NULL,
    FOREIGN KEY (translation_of) REFERENCES BlogPost(id) ON DELETE SET NULL,
    INDEX idx_status_published (status, published_at),
    INDEX idx_category (category_id),
    INDEX idx_translation_of (translation_of)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 36) BlogCategory
CREATE TABLE IF NOT EXISTS BlogCategory (
    id VARCHAR(36) PRIMARY KEY,
    parent_id VARCHAR(36) NULL,
    slug VARCHAR(120) NOT NULL UNIQUE,
    name_ar VARCHAR(120) NOT NULL,
    name_en VARCHAR(120) NULL,
    description VARCHAR(400) NULL,
    sort_order INT DEFAULT 0,
    FOREIGN KEY (parent_id) REFERENCES BlogCategory(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 37) BlogTag
CREATE TABLE IF NOT EXISTS BlogTag (
    id VARCHAR(36) PRIMARY KEY,
    slug VARCHAR(120) NOT NULL UNIQUE,
    name_ar VARCHAR(120) NOT NULL,
    name_en VARCHAR(120) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 38) BlogPostTag
CREATE TABLE IF NOT EXISTS BlogPostTag (
    post_id VARCHAR(36) NOT NULL,
    tag_id VARCHAR(36) NOT NULL,
    PRIMARY KEY (post_id, tag_id),
    FOREIGN KEY (post_id) REFERENCES BlogPost(id) ON DELETE CASCADE,
    FOREIGN KEY (tag_id) REFERENCES BlogTag(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 39) MediaAsset
CREATE TABLE IF NOT EXISTS MediaAsset (
    id VARCHAR(36) PRIMARY KEY,
    uploader_id VARCHAR(36) NULL,
    filename VARCHAR(255) NOT NULL,
    original_name VARCHAR(255) NULL,
    mime VARCHAR(100) NOT NULL,
    size_bytes INT NOT NULL,
    width INT NULL,
    height INT NULL,
    alt_text VARCHAR(255) NULL,
    folder VARCHAR(120) NULL,
    url VARCHAR(500) NOT NULL,
    variants JSON NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (uploader_id) REFERENCES User(id) ON DELETE SET NULL,
    INDEX idx_uploader (uploader_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 40) BlogRevision
CREATE TABLE IF NOT EXISTS BlogRevision (
    id VARCHAR(36) PRIMARY KEY,
    post_id VARCHAR(36) NOT NULL,
    revision_no INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    content_md LONGTEXT NOT NULL,
    changed_by VARCHAR(36) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (post_id) REFERENCES BlogPost(id) ON DELETE CASCADE,
    INDEX idx_post (post_id, revision_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 41) NewsletterSubscriber
CREATE TABLE IF NOT EXISTS NewsletterSubscriber (
    id VARCHAR(36) PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(255) NULL,
    locale VARCHAR(5) NOT NULL DEFAULT 'ar',
    status ENUM('pending','confirmed','unsubscribed','bounced') NOT NULL DEFAULT 'pending',
    source VARCHAR(30) NULL,
    confirm_token VARCHAR(64) NULL,
    unsub_token VARCHAR(64) NOT NULL,
    confirmed_at TIMESTAMP NULL,
    unsubscribed_at TIMESTAMP NULL,
    ip_hash VARCHAR(64) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_status (status),
    INDEX idx_locale_status (locale, status),
    UNIQUE KEY uq_confirm_token (confirm_token),
    UNIQUE KEY uq_unsub_token (unsub_token)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 42) NewsletterCampaign
CREATE TABLE IF NOT EXISTS NewsletterCampaign (
    id VARCHAR(36) PRIMARY KEY,
    post_id VARCHAR(36) NULL,
    created_by VARCHAR(36) NULL,
    subject VARCHAR(255) NOT NULL,
    body_html LONGTEXT NOT NULL,
    body_text LONGTEXT NOT NULL,
    locale VARCHAR(5) NOT NULL DEFAULT 'ar',
    auto_generated BOOLEAN DEFAULT FALSE,
    audience_rule ENUM('locale_exact','locale_with_fallback') NOT NULL DEFAULT 'locale_exact',
    status ENUM('draft','scheduled','sending','sent','failed') NOT NULL DEFAULT 'draft',
    scheduled_at TIMESTAMP NULL,
    total_count INT DEFAULT 0,
    sent_count INT DEFAULT 0,
    failed_count INT DEFAULT 0,
    click_count INT DEFAULT 0,
    sent_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (post_id) REFERENCES BlogPost(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES User(id) ON DELETE SET NULL,
    INDEX idx_status_scheduled (status, scheduled_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 43) NewsletterSend
CREATE TABLE IF NOT EXISTS NewsletterSend (
    id VARCHAR(36) PRIMARY KEY,
    campaign_id VARCHAR(36) NOT NULL,
    subscriber_id VARCHAR(36) NOT NULL,
    status ENUM('queued','sent','failed','skipped') NOT NULL DEFAULT 'queued',
    attempts INT DEFAULT 0,
    error_message TEXT NULL,
    sent_at TIMESTAMP NULL,
    UNIQUE KEY uq_campaign_subscriber (campaign_id, subscriber_id),
    INDEX idx_campaign_status (campaign_id, status),
    FOREIGN KEY (campaign_id) REFERENCES NewsletterCampaign(id) ON DELETE CASCADE,
    FOREIGN KEY (subscriber_id) REFERENCES NewsletterSubscriber(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 44) PlanTemplate
CREATE TABLE IF NOT EXISTS PlanTemplate (
    id VARCHAR(36) PRIMARY KEY,
    owner_id VARCHAR(36) NULL,
    is_global BOOLEAN NOT NULL DEFAULT FALSE,
    template_type ENUM('nutrition','exercise') NOT NULL,
    category VARCHAR(50) NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT NULL,
    snapshot JSON NOT NULL,
    reference_calories INT NULL,
    reference_protein_g INT NULL,
    reference_carbs_g INT NULL,
    reference_fats_g INT NULL,
    usage_count INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_id) REFERENCES User(id) ON DELETE CASCADE,
    INDEX idx_owner_type (owner_id, template_type),
    INDEX idx_global_type (is_global, template_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 45) ContactMessage
CREATE TABLE IF NOT EXISTS ContactMessage (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(30) NULL,
    subject VARCHAR(255) NULL,
    message TEXT NOT NULL,
    status ENUM('new','read','replied','archived') NOT NULL DEFAULT 'new',
    handled_by VARCHAR(36) NULL,
    reply_text TEXT NULL,
    ip_hash VARCHAR(64) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (handled_by) REFERENCES User(id) ON DELETE SET NULL,
    INDEX idx_status_created (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 46) FileAsset (P10 §6.5: metadata for uploads stored OUTSIDE webroot)
CREATE TABLE IF NOT EXISTS FileAsset (
    id VARCHAR(36) PRIMARY KEY,
    owner_id VARCHAR(36) NOT NULL,
    patient_id VARCHAR(36) NULL,
    purpose ENUM('inbody','lab','portal_message','avatar','blog','other') NOT NULL DEFAULT 'other',
    stored_name VARCHAR(255) NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    mime VARCHAR(100) NOT NULL,
    size_bytes INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (owner_id) REFERENCES User(id) ON DELETE CASCADE,
    FOREIGN KEY (patient_id) REFERENCES Patient(id) ON DELETE CASCADE,
    INDEX idx_owner (owner_id),
    INDEX idx_patient (patient_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 47) LabDraft (P10 D-18: AI-extracted values stay DRAFT until doctor approves)
CREATE TABLE IF NOT EXISTS LabDraft (
    id VARCHAR(36) PRIMARY KEY,
    patient_id VARCHAR(36) NOT NULL,
    doctor_id VARCHAR(36) NOT NULL,
    file_id VARCHAR(36) NULL,
    source ENUM('vision','text') NOT NULL,
    items JSON NOT NULL,
    status ENUM('draft','approved','discarded') NOT NULL DEFAULT 'draft',
    reviewed_by VARCHAR(36) NULL,
    reviewed_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES Patient(id) ON DELETE CASCADE,
    FOREIGN KEY (doctor_id) REFERENCES User(id) ON DELETE CASCADE,
    FOREIGN KEY (file_id) REFERENCES FileAsset(id) ON DELETE SET NULL,
    FOREIGN KEY (reviewed_by) REFERENCES User(id) ON DELETE SET NULL,
    INDEX idx_patient_status (patient_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 48) FoodRequest (P11 FL-15/16: doctor requests queue for admin approval)
CREATE TABLE IF NOT EXISTS FoodRequest (
    id VARCHAR(36) PRIMARY KEY,
    doctor_id VARCHAR(36) NOT NULL,
    name_ar VARCHAR(255) NOT NULL,
    name_en VARCHAR(255) NULL,
    calories_per_100g DECIMAL(8,2) NOT NULL,
    protein_per_100g DECIMAL(8,2) NOT NULL,
    carbs_per_100g DECIMAL(8,2) NOT NULL,
    fats_per_100g DECIMAL(8,2) NOT NULL,
    category VARCHAR(50) NULL,
    status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
    review_reason TEXT NULL,
    reviewed_by VARCHAR(36) NULL,
    reviewed_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (doctor_id) REFERENCES User(id) ON DELETE CASCADE,
    FOREIGN KEY (reviewed_by) REFERENCES User(id) ON DELETE SET NULL,
    INDEX idx_doctor_status (doctor_id, status),
    INDEX idx_status_created (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 49) AiRetryQueue (P12 AI-12: graceful degradation queue, drained by CRON-14 in P29)
CREATE TABLE IF NOT EXISTS AiRetryQueue (
    id VARCHAR(36) PRIMARY KEY,
    doctor_id VARCHAR(36) NULL,
    request_type VARCHAR(50) NOT NULL,
    payload JSON NOT NULL,
    attempts INT NOT NULL DEFAULT 0,
    status ENUM('queued','processing','done','dead_letter') NOT NULL DEFAULT 'queued',
    last_error TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (doctor_id) REFERENCES User(id) ON DELETE SET NULL,
    INDEX idx_status_created (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 50) PlanGeneration (P14: generation params + attempts persisted for debuggability)
CREATE TABLE IF NOT EXISTS PlanGeneration (
    id VARCHAR(36) PRIMARY KEY,
    doctor_id VARCHAR(36) NOT NULL,
    patient_id VARCHAR(36) NOT NULL,
    plan_id VARCHAR(36) NULL,
    mode ENUM('from_list','ai_free') NOT NULL DEFAULT 'from_list',
    params JSON NOT NULL,
    attempts INT NOT NULL DEFAULT 0,
    wall_time_ms INT NOT NULL DEFAULT 0,
    status ENUM('success','failed') NOT NULL DEFAULT 'success',
    error TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (doctor_id) REFERENCES User(id) ON DELETE CASCADE,
    FOREIGN KEY (patient_id) REFERENCES Patient(id) ON DELETE CASCADE,
    FOREIGN KEY (plan_id) REFERENCES NutritionPlan(id) ON DELETE SET NULL,
    INDEX idx_doctor_created (doctor_id, created_at),
    INDEX idx_plan (plan_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 51) PatientPortalToken (P19 PP-02/03/04/08: token-only patient access)
CREATE TABLE IF NOT EXISTS PatientPortalToken (
    id VARCHAR(36) PRIMARY KEY,
    patient_id VARCHAR(36) NOT NULL,
    doctor_id VARCHAR(36) NOT NULL,
    token VARCHAR(36) NOT NULL UNIQUE,
    permissions JSON NOT NULL,
    notify_email VARCHAR(255) NULL,
    expires_at TIMESTAMP NOT NULL,
    revoked BOOLEAN NOT NULL DEFAULT FALSE,
    access_count INT NOT NULL DEFAULT 0,
    last_accessed_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES Patient(id) ON DELETE CASCADE,
    FOREIGN KEY (doctor_id) REFERENCES User(id) ON DELETE CASCADE,
    INDEX idx_token (token),
    INDEX idx_patient (patient_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 52) PatientSelfReport (P20: patient-submitted weights linked to their
-- weight_log message; charts merge these WITHOUT touching Visit rows)
CREATE TABLE IF NOT EXISTS PatientSelfReport (
    id VARCHAR(36) PRIMARY KEY,
    patient_id VARCHAR(36) NOT NULL,
    doctor_id VARCHAR(36) NOT NULL,
    message_id VARCHAR(36) NOT NULL UNIQUE,
    weight_kg DECIMAL(5,2) NOT NULL,
    measured_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (patient_id) REFERENCES Patient(id) ON DELETE CASCADE,
    FOREIGN KEY (doctor_id) REFERENCES User(id) ON DELETE CASCADE,
    FOREIGN KEY (message_id) REFERENCES PatientMessage(id) ON DELETE CASCADE,
    INDEX idx_patient_measured (patient_id, measured_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 53) ManualPaymentRequest (P24 ADM-21: bank/WhatsApp path approvals)
CREATE TABLE IF NOT EXISTS ManualPaymentRequest (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    plan_id VARCHAR(36) NOT NULL,
    method ENUM('manual','bank_transfer') NOT NULL,
    reference VARCHAR(255) NOT NULL,
    status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
    review_reason TEXT NULL,
    reviewed_by VARCHAR(36) NULL,
    reviewed_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES User(id) ON DELETE CASCADE,
    FOREIGN KEY (plan_id) REFERENCES SubscriptionPlan(id) ON DELETE RESTRICT,
    FOREIGN KEY (reviewed_by) REFERENCES User(id) ON DELETE SET NULL,
    INDEX idx_status_created (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 54) PaymobTransaction (P24: webhook idempotency + CRON-13 reconciliation)
CREATE TABLE IF NOT EXISTS PaymobTransaction (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    plan_id VARCHAR(36) NULL,
    paymob_transaction_id VARCHAR(100) NOT NULL UNIQUE,
    amount_cents INT NOT NULL,
    currency VARCHAR(10) NOT NULL DEFAULT 'EGP',
    success BOOLEAN NOT NULL,
    raw_payload JSON NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES User(id) ON DELETE CASCADE,
    FOREIGN KEY (plan_id) REFERENCES SubscriptionPlan(id) ON DELETE SET NULL,
    INDEX idx_user_created (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 55) CronRun (P29 CRON-02/OBS-02: last-run ledger + consecutive-failure counting)
CREATE TABLE IF NOT EXISTS CronRun (
    id VARCHAR(36) PRIMARY KEY,
    task VARCHAR(60) NOT NULL,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    finished_at TIMESTAMP NULL,
    status ENUM('running','ok','error') NOT NULL DEFAULT 'running',
    detail TEXT NULL,
    consecutive_failures INT NOT NULL DEFAULT 0,
    INDEX idx_task_started (task, started_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 56) BackupReport (P29 SEC-08/22: backup + restore-verification reports)
CREATE TABLE IF NOT EXISTS BackupReport (
    id VARCHAR(36) PRIMARY KEY,
    file_path VARCHAR(500) NOT NULL,
    bytes BIGINT NOT NULL DEFAULT 0,
    off_server VARCHAR(500) NULL,
    status ENUM('ok','local-only','verified','mismatch') NOT NULL DEFAULT 'local-only',
    detail TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_status_created (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET FOREIGN_KEY_CHECKS = 1;