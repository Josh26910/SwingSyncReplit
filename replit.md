# [Project name]

_Replace the heading above with the project's name, and this line with one sentence describing what this app does for users._

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Required env: `JWT_SECRET` — signs/verifies account auth tokens (any long random string; treat as a secret)
- Required env: `ADMIN_TOKEN` — shared secret gating the tempo-videos admin endpoints/screen (any long random string; treat as a secret). Enter it once at `/admin-tempo-videos` in the app; it's cached on-device afterward.
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
