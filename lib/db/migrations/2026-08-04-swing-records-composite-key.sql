-- Run this ONCE against an existing database, BEFORE `pnpm --filter
-- @workspace/db run push`, if the database already holds swing_records rows.
--
-- Why it can't just be a push: `drizzle-kit push` sees swing_records.id
-- disappear and swing_records.client_id appear, and will drop the column
-- rather than rename it — losing every record's client-side identity, which
-- is the one thing sync uses to dedupe. The rename below preserves it.
--
-- On a fresh/empty database this file is unnecessary; `push` alone is
-- correct there.
--
-- Background: docs/AUDIT.md, findings S2 and S3.

BEGIN;

-- --------------------------------------------------------------------
-- users: revocable auth tokens
-- --------------------------------------------------------------------
-- Existing sessions keep working (they were signed before versioning
-- existed, so they carry no `ver` claim and will be rejected on the next
-- request — users sign in again once). Default 0 matches freshly signed
-- tokens from here on.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS token_version integer NOT NULL DEFAULT 0;

-- --------------------------------------------------------------------
-- swing_records: (user_id, client_id) identity
-- --------------------------------------------------------------------
-- The old global primary key on `id` meant any account could claim ids
-- belonging to another and, because sync dedupes with ON CONFLICT DO
-- NOTHING, silently stop that account's records from ever syncing.

ALTER TABLE swing_records RENAME COLUMN id TO client_id;

ALTER TABLE swing_records DROP CONSTRAINT IF EXISTS swing_records_pkey;

-- If a duplicate (user_id, client_id) somehow exists, this will fail loudly
-- rather than silently discarding a row. De-duplicate manually and re-run.
ALTER TABLE swing_records
  ADD CONSTRAINT swing_records_pkey PRIMARY KEY (user_id, client_id);

COMMIT;
