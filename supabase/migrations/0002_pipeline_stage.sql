-- FR-5.2 Recruitment Pipeline / Kanban View: the PRD's Kanban columns have
-- no backing column in the PRD's own DDL — this migration fills that gap.
CREATE TYPE pipeline_stage AS ENUM (
    'initial_outreach',
    'in_discussion',
    'visit_scheduled',
    'agreement_feeder_active',
    'dormant'
);

ALTER TABLE institutions
    ADD COLUMN pipeline_stage pipeline_stage NOT NULL DEFAULT 'initial_outreach';

-- FR-5.3 CSV import upserts by domain (the same field the add-in already
-- matches on) — needs a real uniqueness constraint for ON CONFLICT to work,
-- consistent with the MVP's single-recruiter assumption that a domain maps
-- to exactly one institution.
ALTER TABLE institutions
    ADD CONSTRAINT institutions_domain_unique UNIQUE (domain);

-- institutions_with_health was created with `SELECT *`, which Postgres
-- expands to the column list at creation time — it won't pick up the new
-- column automatically, so the view must be recreated.
DROP VIEW institutions_with_health;

CREATE VIEW institutions_with_health
WITH (security_invoker = true) AS
    SELECT *, institution_health_status(last_interaction_at) AS health_status
    FROM institutions;
