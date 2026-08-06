-- Adds the password_reset_tokens table. Safe to run on a fresh database too
-- (IF NOT EXISTS), but also safe to run before `drizzle-kit push` on an
-- existing one — unlike the 2026-08-04 migration, this is a pure addition
-- with nothing for push to misinterpret, so `push` alone would also work
-- here. Kept as an explicit migration anyway so the reset feature's schema
-- history isn't silently implicit.

BEGIN;

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS password_reset_tokens_user_id_idx
  ON password_reset_tokens (user_id);

COMMIT;
