# 3to1 Golf

Golf swing tempo trainer: audio tempo beeps, frame-by-frame swing video analysis (takeaway/top/impact ratio), pro tempo references, and practice tracking. Formerly "SwingTempo" (name was taken on the App Store); the package/folder is still `artifacts/swing-tempo` and on-device storage keys keep the `swingTempo` prefix on purpose so existing installs don't lose data.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Required env: `JWT_SECRET` — signs/verifies account auth tokens (any long random string; treat as a secret)
- Required env: `ADMIN_TOKEN` — shared secret gating the tempo-videos admin endpoints/screen (any long random string; treat as a secret). Enter it once at `/admin-tempo-videos` in the app; it's cached on-device afterward.
- Optional env: `RESEND_API_KEY` + `EMAIL_FROM` (e.g. `3to1 Golf <noreply@yourdomain.com>`, domain must be verified in Resend) — sends Forgot Password codes. Without the key, dev logs the email (code included) instead of sending; production logs an error and sends nothing. Without `EMAIL_FROM`, Resend's shared test sender is used, which only delivers to the Resend account owner's own address.
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
- Account auth: `artifacts/api-server/src/routes/auth.ts` (signup/login/me, `DELETE /auth/me` account deletion — required by App Store 5.1.1(v); synced rows go via ON DELETE CASCADE) + `artifacts/api-server/src/middlewares/auth.ts` (bearer-token verification)
- Cloud sync: `artifacts/api-server/src/routes/sync.ts` (server merge) + `artifacts/swing-tempo/hooks/useCloudSync.ts` (client push/pull loop), mounted app-wide via `artifacts/swing-tempo/components/CloudSyncManager.tsx` in `app/_layout.tsx`
- Tempos tab reference videos: `artifacts/api-server/src/routes/tempoVideos.ts` (admin-gated CRUD + public list) + `artifacts/swing-tempo/app/admin-tempo-videos.tsx` (unlinked admin screen — paste a YouTube URL/id and optional clip start to attach a clip to an entry, no redeploy needed). The videos themselves are never stored/hosted by us — only a `youtubeId` + optional clip-start/end seconds live in the `tempo_videos` table; `artifacts/swing-tempo/data/tempoPlayers.ts`'s static `TEMPO_PLAYERS` array is kept only as an offline/first-load fallback for the Tempos tab.

- Public website: `artifacts/swing-tempo/server/site/` (plain HTML/CSS), served by `server/serve.js` on the production domain — `/` (home), `/privacy`, `/support`, `/delete-account` (the App Store / Google Play privacy, support and account-deletion URLs), assets under `/site/`. The old Expo Go "scan to open" page moved from `/` to `/expo-go`. Set env `SUPPORT_EMAIL` to a real inbox; it's substituted into the pages (defaults to support@3to1golf.com). Keep `privacy.html` in sync with what the app actually collects.
- Store builds: EAS (`artifacts/swing-tempo/eas.json`). Bundle id / Android package `com.threetoonegolf.app` (permanent after the first store upload). iOS permission strings live in the `expo-image-picker` / `expo-av` plugin entries in `app.json` — don't add `microphonePermission: false` to image-picker, it strips the expo-av mic string Apple requires. **Production builds must set `EXPO_PUBLIC_API_URL`** to the deployed API (e.g. `eas env:create --environment production`); the Replit dev domain sleeps.

## Architecture decisions

- Expo SDK 57 (React Native 0.86, React 19.2, New Architecture only). expo-av is gone (removed in SDK 55): tones use expo-audio (`utils/audio.ts`), and every swing video goes through `components/SwingVideo.tsx`, an expo-video wrapper that keeps the old expo-av-style ref API (setPositionAsync / playAsync / pauseAsync / setRateAsync + ms-based status callbacks) so the analysis/compare/tracker timing logic didn't need re-tuning. Background playback and PiP are disabled in the expo-audio / expo-video plugin config on purpose — the app never plays in the background, and declaring it invites App Review / Play Console questions.

- Auth is email + password (bcrypt-hashed, JWT bearer tokens). Forgot Password emails a 6-digit code (`POST /auth/forgot-password` → `POST /auth/reset-password`, which also signs the user in). Codes are stored SHA-256-hashed in `password_reset_codes`, expire in 15 min, die after 5 wrong guesses, and re-requests within 60s are silently ignored. Both endpoints answer identically for unknown emails so they can't be used to discover accounts. Email goes through `artifacts/api-server/src/lib/email.ts` (Resend HTTP API via fetch, no SDK).
- Mobile app auth tokens should be persisted with `expo-secure-store` and supplied to `@workspace/api-client-react` via `setAuthTokenGetter`; the base API URL is set via `setBaseUrl` and must point at wherever `@workspace/api-server` is actually deployed.
- `EXPO_PUBLIC_API_URL` (consumed by `context/AuthContext.tsx` via `setBaseUrl`) is wired to `https://$REPLIT_DEV_DOMAIN` in both `artifacts/swing-tempo/package.json`'s `dev` script and `artifacts/swing-tempo/scripts/build.js` — this relies on `artifacts/api-server` being routed on that same domain under `/api` (see its `artifact.toml`). If the API server is ever deployed to a different domain, update both of those instead of hand-editing generated client code.
- Practice data (sessions, swing history) is **local-first**: AsyncStorage (`utils/sessions.ts`, `utils/swingHistory.ts`) is the source of truth the UI always reads from. `useCloudSync` pushes the full local snapshot to `POST /api/sync` every 60s while signed in and replaces local storage with the server's merged response. Merge rules (see `routes/sync.ts`): practice-session rows are upserted per `(user, date)` keeping `greatest(local, server)` for duration/swings (so a sync can never erase already-recorded time); swing records are immutable and deduped by their client-generated `id` (`onConflictDoNothing`). Signing out or being offline just means the device falls behind on sync — it never blocks local usage, and errors are swallowed silently by design.
- Thumbnails (`utils/thumbnails.ts`, via `expo-video-thumbnails`) and `thumbnailUri` on `Swing`/`SwingRecord` are **local-only** — a device file path, not something the server stores. `useCloudSync` explicitly reattaches the local `thumbnailUri` after every sync round-trip (by record id) since the server-merged response never has it; don't add it to `SyncPayload`/`SwingRecordDto` without also standing up real object storage for it.
- Video export (`Export` button in `app/(tabs)/analysis.tsx`) is a v1: it shares the original clip via the OS share sheet (`expo-sharing`), no burned-in tempo overlay. Real overlay export needs frame-accurate video re-encoding (ffmpeg-kit or similar), which isn't available in Expo Go — that requires moving to a custom dev client first.
- Video files themselves are never uploaded anywhere yet (no cloud object storage wired up) — `Swing.uri`/`SwingRecord` only ever hold local device URIs. The `videoUrl`/`thumbnailUrl` columns on `swing_records` exist already (nullable, unused) so that a future R2/S3 upload feature won't need a migration.

## Product

_Describe the high-level user-facing capabilities of this app once they exist._

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
