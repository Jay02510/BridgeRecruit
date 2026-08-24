-- The domain uniqueness constraint was global (UNIQUE (domain)), meaning
-- two different recruiters' institutions could never share a domain value
-- at all — and worse, an upsert keyed on onConflict:'domain' from one
-- user's import/quick-create could silently overwrite a DIFFERENT user's
-- institution row if the generated/real domain happened to collide.
-- Scoping the constraint to (user_id, domain) fixes both: each recruiter
-- has their own independent domain namespace, and upserts can only ever
-- match their own rows.
ALTER TABLE institutions DROP CONSTRAINT institutions_domain_unique;
ALTER TABLE institutions ADD CONSTRAINT institutions_user_domain_unique UNIQUE (user_id, domain);
