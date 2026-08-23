-- Two client Excel columns had no home in the schema and were silently
-- dropped on import: "Public or Private" and "Partnership Finalized?".
CREATE TYPE institution_ownership AS ENUM ('public', 'private');

ALTER TABLE institutions
    ADD COLUMN ownership_type institution_ownership,
    ADD COLUMN partnership_finalized BOOLEAN NOT NULL DEFAULT FALSE;

-- institutions_with_health was created with `SELECT *`, which Postgres
-- expands to the column list at creation time — recreate so the new
-- columns are visible through it.
DROP VIEW institutions_with_health;

CREATE VIEW institutions_with_health
WITH (security_invoker = true) AS
    SELECT *, institution_health_status(last_interaction_at) AS health_status
    FROM institutions;
