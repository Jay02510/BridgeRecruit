-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- 1. ENUMS
-- ============================================================================
CREATE TYPE institution_tier AS ENUM ('tier_1_feeder', 'tier_2_high_potential', 'tier_3_standard');
CREATE TYPE institution_type AS ENUM ('international_high_school', 'foreign_school', 'local_high_school', 'university_partner');
CREATE TYPE interaction_channel AS ENUM ('email', 'in_person_visit', 'fair_booth', 'virtual_meeting', 'phone_call');
CREATE TYPE relationship_status AS ENUM ('active_warm', 'cooling', 'stalled_cold');
CREATE TYPE task_status AS ENUM ('pending', 'completed', 'cancelled');

-- ============================================================================
-- 2. USERS (RECRUITERS)
-- ============================================================================
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    azure_oid VARCHAR(255) UNIQUE NOT NULL,      -- Microsoft Entra ID Object ID
    email VARCHAR(255) UNIQUE NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    territory VARCHAR(100) DEFAULT 'East Asia',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 3. INSTITUTIONS (SCHOOLS & UNIVERSITIES)
-- ============================================================================
CREATE TABLE institutions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    domain VARCHAR(100) NOT NULL,                -- e.g., 'seoulforeign.org' for auto-matching
    institution_type institution_type NOT NULL DEFAULT 'international_high_school',
    tier institution_tier NOT NULL DEFAULT 'tier_2_high_potential',
    country VARCHAR(100) NOT NULL DEFAULT 'South Korea',
    city VARCHAR(100) NOT NULL,
    address TEXT,
    curriculum VARCHAR(100),                     -- e.g., 'IB / AP / American Diploma'
    reengagement_threshold_days INT NOT NULL DEFAULT 14, -- Threshold for ghosting detection
    last_interaction_at TIMESTAMPTZ,             -- Denormalized for fast sorting
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_institutions_domain ON institutions(domain);
CREATE INDEX idx_institutions_last_interaction ON institutions(user_id, last_interaction_at);

-- health_status cannot be a STORED generated column: its expression depends
-- on NOW(), which Postgres requires to be IMMUTABLE for generated columns,
-- and NOW() is only STABLE. Worse, a stored column would only recompute on
-- write, but health_status must decay purely from time passing (no new
-- interaction needed to go active_warm -> cooling on day 15). So it's
-- computed at query time instead, via a STABLE function.
-- Never-contacted institutions (last_interaction_at IS NULL) read as
-- stalled_cold, same as any institution whose last touch is >30 days old.
CREATE FUNCTION institution_health_status(last_interaction_at TIMESTAMPTZ)
RETURNS relationship_status
LANGUAGE sql
STABLE
AS $$
    SELECT CASE
        WHEN last_interaction_at IS NULL THEN 'stalled_cold'::relationship_status
        WHEN last_interaction_at >= NOW() - INTERVAL '14 days' THEN 'active_warm'::relationship_status
        WHEN last_interaction_at >= NOW() - INTERVAL '30 days' THEN 'cooling'::relationship_status
        ELSE 'stalled_cold'::relationship_status
    END;
$$;

-- Convenience view: institutions with health_status computed inline, so
-- application queries can select/filter on it without repeating the
-- function call everywhere.
CREATE VIEW institutions_with_health
WITH (security_invoker = true) AS
    SELECT *, institution_health_status(last_interaction_at) AS health_status
    FROM institutions;

-- ============================================================================
-- 4. CONTACTS (COUNSELORS & ADVISORS)
-- ============================================================================
CREATE TABLE contacts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    email VARCHAR(255) NOT NULL,
    title VARCHAR(100),                          -- e.g., 'Head of College Counseling'
    phone VARCHAR(50),
    kakao_id VARCHAR(100),
    is_primary BOOLEAN DEFAULT FALSE,
    preferences_notes TEXT,                      -- e.g., 'Prefers STEM info, contact before 10 AM'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_contacts_email ON contacts(email);
CREATE INDEX idx_contacts_institution ON contacts(institution_id);

-- ============================================================================
-- 5. INTERACTIONS (OMNI-CHANNEL TIMELINE)
-- ============================================================================
CREATE TABLE interactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    channel interaction_channel NOT NULL,
    subject VARCHAR(255) NOT NULL,
    summary TEXT NOT NULL,                       -- AI-generated summary or recruiter notes
    raw_content TEXT,                            -- Raw email body or notes transcription
    outlook_internet_message_id VARCHAR(500),    -- Deep link / deduplication ID
    materials_shared TEXT[],                     -- e.g., ARRAY['2027_Scholarship_Guide.pdf']
    interaction_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_interactions_inst_date ON interactions(institution_id, interaction_date DESC);

-- ============================================================================
-- 6. TASKS & FOLLOW-UPS (CALENDAR SYNC)
-- ============================================================================
CREATE TABLE tasks_followups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    institution_id UUID NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
    contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
    interaction_id UUID REFERENCES interactions(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    focus_agenda TEXT,                           -- Prep brief injected into calendar
    due_date TIMESTAMPTZ NOT NULL,
    status task_status NOT NULL DEFAULT 'pending',
    outlook_event_id VARCHAR(500),               -- Microsoft Graph Calendar Event ID
    is_stalled_reengagement BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tasks_due ON tasks_followups(user_id, due_date, status);

-- ============================================================================
-- 7. AUTOMATION TRIGGERS
-- ============================================================================
-- Keep 'last_interaction_at' on institutions synchronized whenever an
-- interaction is logged (this is what drives health_status recalculation).
CREATE OR REPLACE FUNCTION update_institution_last_interaction()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE institutions
    SET
        last_interaction_at = NEW.interaction_date,
        updated_at = NOW()
    WHERE id = NEW.institution_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_after_interaction_insert
AFTER INSERT ON interactions
FOR EACH ROW
EXECUTE FUNCTION update_institution_last_interaction();

-- ============================================================================
-- 8. ROW-LEVEL SECURITY
-- ============================================================================
-- MVP default: permissive single-recruiter policies scoped by user_id.
-- Tighten before real client data lands (e.g. once multi-recruiter/territory
-- rules are defined). Enabling RLS now avoids retrofitting it later.
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE institutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks_followups ENABLE ROW LEVEL SECURITY;

-- Server-side API routes use the service_role key (bypasses RLS entirely),
-- so these policies only govern any future direct client-side access via
-- the anon/publishable key. For MVP: authenticated users can see/manage
-- only rows tied to their own users.id (matched via auth.uid() once
-- Supabase Auth or a custom claims bridge is wired up in Phase 3).
CREATE POLICY "Users manage own row" ON users
    FOR ALL USING (auth.uid()::text = azure_oid) WITH CHECK (auth.uid()::text = azure_oid);

CREATE POLICY "Users manage own institutions" ON institutions
    FOR ALL USING (user_id IN (SELECT id FROM users WHERE azure_oid = auth.uid()::text))
    WITH CHECK (user_id IN (SELECT id FROM users WHERE azure_oid = auth.uid()::text));

CREATE POLICY "Users manage own contacts" ON contacts
    FOR ALL USING (institution_id IN (
        SELECT id FROM institutions WHERE user_id IN (SELECT id FROM users WHERE azure_oid = auth.uid()::text)
    ))
    WITH CHECK (institution_id IN (
        SELECT id FROM institutions WHERE user_id IN (SELECT id FROM users WHERE azure_oid = auth.uid()::text)
    ));

CREATE POLICY "Users manage own interactions" ON interactions
    FOR ALL USING (user_id IN (SELECT id FROM users WHERE azure_oid = auth.uid()::text))
    WITH CHECK (user_id IN (SELECT id FROM users WHERE azure_oid = auth.uid()::text));

CREATE POLICY "Users manage own tasks_followups" ON tasks_followups
    FOR ALL USING (user_id IN (SELECT id FROM users WHERE azure_oid = auth.uid()::text))
    WITH CHECK (user_id IN (SELECT id FROM users WHERE azure_oid = auth.uid()::text));
