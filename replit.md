# SwingTempo

A golf swing tempo trainer: play an audible 3:1 (or 2:1) rhythm to swing to, film your own swing and mark takeaway/top/impact to measure the ratio you actually produced, and compare it against reference tempos from tour professionals.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm run test` — run the unit tests (vitest, in `artifacts/swing-tempo/__tests__/`)
- `pnpm run audit:prod` — audit production dependencies
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- **Existing databases:** run `lib/db/migrations/2026-08-04-swing-records-composite-key.sql` **before** the next `push`. It renames `swing_records.id` → `client_id` and moves to a `(user_id, client_id)` primary key; a bare `push` would drop the column and lose every record's sync identity. Not needed on a fresh database.
- Required env: `DATABASE_URL` — Postgres connection string
- Required env: `JWT_SECRET` — signs/verifies account auth tokens (any long random string; treat as a secret)
- Required env: `ADMIN_TOKEN` — shared secret gating the tempo-videos admin endpoints/screen (any long random string; treat as a secret). Enter it once at `/admin-tempo-videos` in the app; it's cached on-device afterward.
- Optional env: `CORS_ALLOWED_ORIGINS` — comma-separated browser origins allowed to call the API. Defaults to `https://$REPLIT_DEV_DOMAIN`. Native builds send no `Origin` and are unaffected.
- `JWT_SECRET` and `ADMIN_TOKEN` are both validated at boot and must be **at least 32 characters** — the process refuses to start otherwise. Generate with `openssl rand -base64 48`.
- Optional env: `RESEND_API_KEY` — enables the forgot-password flow (`POST /auth/forgot-password`). Without it the server still starts; that route just logs a warning and skips sending. Optional env: `FROM_EMAIL` — sender address for reset emails, default `SwingTempo <onboarding@resend.dev>` (Resend's shared sandbox sender — **can only deliver to the email on the Resend account itself**, not real app users, until a domain is verified in Resend and `FROM_EMAIL` is set to an address on it). Optional env: `APP_URL` — base URL reset links point at; defaults to `https://$REPLIT_DEV_DOMAIN`.
- One-time setup for tempo videos: after `DATABASE_URL`/schema push, run `pnpm --filter @workspace/api-server run seed:tempo-videos` to migrate the old bundled `TEMPO_PLAYERS` array into the `tempo_videos` table (safe to re-run — it no-ops if the table already has rows).

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- DB schema (source of truth): `lib/db/src/schema/` — one file per table, e.g. `users.ts`, `practiceSessions.ts`, `swingRecords.ts`
- API contract (source of truth): `lib/api-spec/openapi.yaml` — edit this, then run the codegen command above; never hand-edit `lib/api-zod/src/generated/**` or `lib/api-client-react/src/generated/**`
- Account auth: `artifacts/api-server/src/routes/auth.ts` (signup/login/me) + `artifacts/api-server/src/middlewares/auth.ts` (bearer-token verification)
- Cloud sync: `artifacts/api-server/src/routes/sync.ts` (server merge) + `artifacts/swing-tempo/hooks/useCloudSync.ts` (client push/pull loop), mounted app-wide via `artifacts/swing-tempo/components/CloudSyncManager.tsx` in `app/_layout.tsx`
- Tempos tab reference videos: `artifacts/api-server/src/routes/tempoVideos.ts` (admin-gated CRUD + public list) + `artifacts/swing-tempo/app/admin-tempo-videos.tsx` (unlinked admin screen — paste a YouTube URL/id and optional clip start to attach a clip to an entry, no redeploy needed). The videos themselves are never stored/hosted by us — only a `youtubeId` + optional clip-start/end seconds live in the `tempo_videos` table; `artifacts/swing-tempo/data/tempoPlayers.ts`'s static `TEMPO_PLAYERS` array is kept only as an offline/first-load fallback for the Tempos tab.

## Architecture decisions

- Auth is email + password (bcrypt-hashed, JWT bearer tokens), not magic-link/OTP, because no transactional email service is configured yet — password auth doesn't require sending mail to work. Revisit once an email provider (e.g. Resend) is wired up.
- Mobile app auth tokens should be persisted with `expo-secure-store` and supplied to `@workspace/api-client-react` via `setAuthTokenGetter`; the base API URL is set via `setBaseUrl` and must point at wherever `@workspace/api-server` is actually deployed.
- `EXPO_PUBLIC_API_URL` (consumed by `context/AuthContext.tsx` via `setBaseUrl`) is wired to `https://$REPLIT_DEV_DOMAIN` in both `artifacts/swing-tempo/package.json`'s `dev` script and `artifacts/swing-tempo/scripts/build.js` — this relies on `artifacts/api-server` being routed on that same domain under `/api` (see its `artifact.toml`). If the API server is ever deployed to a different domain, update both of those instead of hand-editing generated client code.
- Practice data (sessions, swing history) is **local-first**: AsyncStorage (`utils/sessions.ts`, `utils/swingHistory.ts`) is the source of truth the UI always reads from. `useCloudSync` pushes the full local snapshot to `POST /api/sync` every 60s while signed in and replaces local storage with the server's merged response. Merge rules (see `routes/sync.ts`): practice-session rows are upserted per `(user, date)` keeping `greatest(local, server)` for duration/swings (so a sync can never erase already-recorded time); swing records are immutable and deduped by their client-generated `id` (`onConflictDoNothing`). Signing out or being offline just means the device falls behind on sync — it never blocks local usage, and errors are swallowed silently by design.
- Thumbnails (`utils/thumbnails.ts`, via `expo-video-thumbnails`) and `thumbnailUri` on `Swing`/`SwingRecord` are **local-only** — a device file path, not something the server stores. `useCloudSync` explicitly reattaches the local `thumbnailUri` after every sync round-trip (by record id) since the server-merged response never has it; don't add it to `SyncPayload`/`SwingRecordDto` without also standing up real object storage for it.
- Video sharing (`Share Clip` button in `app/(tabs)/analysis.tsx`) shares the **original, unmodified** clip via the OS share sheet (`expo-sharing`) — no burned-in tempo overlay. Real overlay export needs frame-accurate video re-encoding (ffmpeg-kit or similar), which isn't available in Expo Go — that requires moving to a custom dev client first. The button is labelled "Share Clip" rather than "Export" so it doesn't imply the output carries the analysis.
- The imported-swing library (`context/SwingLibraryContext.tsx`) persists to AsyncStorage via `utils/swingLibraryStorage.ts`, and imported clips are **copied out of the OS cache directory** into `documentDirectory/swings/` on import — `ImagePicker` returns a cache path that iOS and Android are free to reclaim, so persisting the metadata alone would leave dangling URIs.
- Auth tokens are revocable through `users.token_version`: it's embedded in the JWT and compared on every request, so bumping it invalidates every outstanding token for that account without needing a session table. Password change bumps it.
- **Password reset** (`utils/email.ts` server-side, `POST /auth/forgot-password` + `POST /auth/reset-password`) is implemented end-to-end, but **cannot yet reach real users** — no domain is verified in Resend, so it runs on the shared `onboarding@resend.dev` sandbox sender, which only delivers to the email address on the Resend account itself. To make this work for real accounts: verify a domain in Resend, set `FROM_EMAIL` to an address on it. See `docs/AUDIT.md` F5.
- Video files themselves are never uploaded anywhere yet (no cloud object storage wired up) — `Swing.uri`/`SwingRecord` only ever hold local device URIs. The `videoUrl`/`thumbnailUrl` columns on `swing_records` exist already (nullable, unused) so that a future R2/S3 upload feature won't need a migration.

## Product

- **Tones tab** — the metronome. Long-game (3:1) and short-game (2:1) presets, audible start/top/impact cues in three sound modes, haptics, and a live phase dial. Loading a reference pro from the Tempos tab drives this same engine as a "custom" tempo.
- **Tempos tab** — the reference library: ~56 tour swings with their measured backswing/downswing/ratio, filterable by shot category and searchable. Where a clip has been sourced, a link out to that swing on YouTube at the right timestamp.
- **Videos tab (Swing Lab)** — import swing clips from the camera roll, browse them, and pick two to compare side by side. Pro entries load their tempo into the trainer.
- **Analysis tab** — mark takeaway/top/impact on an imported clip, get the ratio, accuracy and grade, replay at reduced speed with an optional impact zoom, and share the original clip.
- **Profile tab** — account, practice streak, contribution grid, weekly recap, tempo-consistency scores, recent swings, and per-club breakdown. Also data export and account deletion.

Practice data works fully signed-out and offline; an account only adds cross-device sync.

## User preferences

- Reference-video sourcing: only official tournament/network channels (USGA, The R&A, Masters, PGA Championship, PGA TOUR, Ryder Cup, DP World Tour, Golf Channel). No fan compilations, swing-analysis channels, or instructional uploads.
- Reference clips must be **real-time speed**, not pre-slowed — the app applies its own slow-motion, and pre-slowed footage double-slows.
- We do **not** download, re-host, or redistribute broadcast footage. Only a `youtubeId` plus clip start/end seconds are stored; playback is always a link out. This is a deliberate rights decision, not an implementation gap.

## Gotchas

- **Dates are device-local, never UTC.** Use `utils/dates.ts` (`todayIso`, `toLocalIsoDate`, `daysAgoIso`). `new Date().toISOString().slice(0, 10)` returns the *UTC* date, which rolls over mid-morning in Australia and silently breaks streaks, the contribution grid and the weekly recap.
- **`useActiveTimeTracker` is the only writer of practice time.** Don't add a second mechanism — there used to be one (`recordSessionStart`/`finalizeSession`) that double-counted and credited closed-app hours as practice.
- **The server merges sessions with `greatest(local, server)`**, so an inflated duration is permanent and uncorrectable. That's why `duration`/`swings` are bounded in the OpenAPI schema *and* clamped in `utils/sessions.ts`. Keep both.
- **`saveSwingRecords` owns the 500-record cap**, not `addSwingRecord` — the post-sync write-back path calls it directly and would otherwise bypass any cap enforced further up.
- **Never edit `lib/api-zod/src/generated/**` or `lib/api-client-react/src/generated/**`.** Edit `lib/api-spec/openapi.yaml` and re-run codegen.
- **Changing a password rotates the token.** `PATCH /auth/password` bumps `users.token_version`, invalidating every existing token, and returns a replacement. Clients must persist it.
- Swing record identity is `(user_id, client_id)`, not a global id. Don't reintroduce a bare client-generated primary key — it let one account block another's sync.
- Run `pnpm run typecheck && pnpm run test` before pushing; CI runs both.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
