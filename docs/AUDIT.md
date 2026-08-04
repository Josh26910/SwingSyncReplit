# SwingTempo — Security & Feature Audit

**Date:** 2026-08-04
**Scope:** `artifacts/api-server`, `artifacts/swing-tempo`, `lib/db`, `lib/api-zod`, `lib/api-client-react`, deployment config.
**Method:** full read of every server route, middleware, schema, and client screen; `pnpm audit`; deployment/env config review. No live pentest was run — this is a code-level audit, so runtime-only issues (TLS config, WAF, infra) are out of scope.

---

## Part 1 — Security

### Severity summary

| # | Severity | Finding |
|---|----------|---------|
| S1 | **High** | No rate limiting anywhere — login/signup brute force + bcrypt CPU exhaustion |
| S2 | **High** | `swing_records.id` is a global primary key, so any user can permanently block another user's records from syncing |
| S3 | **High** | Password change does not invalidate existing tokens; no revocation of any kind |
| S4 | **Medium** | Admin token compared with `!==` (non-constant-time) and never expires/rotates |
| S5 | **Medium** | `cors()` with no options — every origin can call every endpoint, including admin routes |
| S6 | **Medium** | Reflected XSS in the static landing server via `X-Forwarded-Host` |
| S7 | **Medium** | Unvalidated numeric/date fields in `/api/sync` crash the request handler (500) |
| S8 | **Medium** | `/api/sync` has no array-size limit, no transaction, and issues one query per element |
| S9 | **Medium** | Signup leaks whether an email is registered (account enumeration) |
| S10 | **Low** | No security headers on either server (no helmet, no CSP/HSTS/X-Content-Type-Options) |
| S11 | **Low** | JWT verification does not pin the algorithm and sets no `iss`/`aud` |
| S12 | **Low** | Malformed UUID in `/api/tempo-videos/:id` produces an unhandled 500 |
| S13 | **Low** | No global error handler; Express's default handler is the fallback |
| S14 | **Low** | Auth token stored in `localStorage` on web (XSS-readable) |
| S15 | **Low** | 27 known-vulnerable transitive dependencies (17 high) |
| S16 | **Info** | `cookie-parser` shipped as a dependency but never used |
| S17 | **Info** | Public `GET /api/tempo-videos` is unauthenticated, unpaginated, and uncached |

---

### S1 — No rate limiting (High)

`artifacts/api-server/src/app.ts` mounts only `pino-http`, `cors`, and body parsers. There is no `express-rate-limit`, no slow-down, no lockout, and no CAPTCHA anywhere in the tree.

Consequences:

- **Credential brute force.** `POST /api/auth/login` (`routes/auth.ts:58`) can be hit without limit. The only defence is bcrypt cost 12 and the 8-char minimum.
- **CPU exhaustion / DoS.** That same bcrypt cost is a liability without a limiter: each unauthenticated login attempt burns ~200–400 ms of CPU on a single-threaded Node process. A few hundred concurrent bogus logins will make the API unresponsive for real users. Signup (`bcrypt.hash`, `auth.ts:41`) is the same, plus it writes a row.
- **Admin-token guessing.** `x-admin-token` is a single static secret with unlimited attempts (see S4/S5).
- **Sync abuse.** `POST /api/sync` is the most expensive endpoint in the app (S8) and is equally unthrottled.

**Fix:** add `express-rate-limit` with a strict bucket on `/auth/login`, `/auth/signup`, `/auth/password` (e.g. 5–10 per 15 min per IP *and* per email), a moderate bucket on `/sync`, and a global bucket on everything else. Because this runs behind Replit's router, also set `app.set("trust proxy", 1)` so the limiter keys on the real client IP rather than the proxy's.

---

### S2 — Global `swing_records.id` allows cross-user record blocking (High)

`lib/db/src/schema/swingRecords.ts:17` — `id: text("id").primaryKey()` — the primary key is a **client-generated string, globally unique across all users**. `routes/sync.ts:44-60` inserts with `.onConflictDoNothing({ target: swingRecordsTable.id })`.

The client generates ids as `` `${Date.now()}-${Math.random().toString(36).slice(2,8)}` `` (`utils/swingHistory.ts:49`). Accidental collisions are unlikely; **deliberate** ones are trivial. Any authenticated user can POST a `/api/sync` payload full of plausible ids (`1754...-abc123`). Every one of those ids is then permanently owned by the attacker, and when the legitimate owner's device tries to sync a record with a matching id, `onConflictDoNothing` silently drops it — no error, no retry, and the client's "swallow all sync errors" design (`useCloudSync.ts:48`) means the user is never told.

This is a data-integrity/denial issue, not a disclosure one: reads are correctly scoped with `eq(swingRecordsTable.userId, userId)` (`sync.ts:65`), so nobody can read anyone else's data.

**Fix:** make the identity composite. Either a surrogate `uuid` PK with a `uniqueIndex(userId, clientId)`, or a composite primary key `(userId, id)`. Then scope the conflict target to that composite. Either way the client id stops being a global namespace.

---

### S3 — Tokens are never revocable; password change doesn't log other sessions out (High)

`middlewares/auth.ts:19-21` signs a 30-day JWT containing only `{ sub: userId }`. `requireAuth` (line 36) verifies the signature and looks the user up — but there is no token version, no `jti`, no denylist, and no session table.

Results:

- `PATCH /api/auth/password` (`routes/auth.ts:100`) changes the hash but **every previously issued token stays valid for the rest of its 30 days**. The single most important "I've been compromised" action a user can take does nothing to the attacker's session.
- Sign-out (`AuthContext.tsx:69`) only deletes the token locally. A copied token keeps working.
- There is no way to revoke a leaked token short of rotating `JWT_SECRET`, which logs out every user on the platform.

**Fix:** add a `token_version` integer to `users`, embed it in the JWT, and compare it in `requireAuth`. Bump it on password change and on any explicit "sign out everywhere". Also shorten the access token (e.g. 1 h) and add a refresh token if the 30-day UX matters.

---

### S4 — Admin token: non-constant-time comparison, no rotation (Medium)

`middlewares/auth.ts:57-67`:

```ts
const provided = req.headers["x-admin-token"];
if (provided !== expected) { ... }
```

Two issues:

1. `!==` on strings is not constant-time. Combined with no rate limiting (S1), this is theoretically byte-by-byte recoverable. Network jitter makes this hard in practice, which is why this is Medium rather than High — but it costs one line to fix.
2. The token is a single static shared secret with no expiry, no rotation path, and no audit log. Once entered on the admin screen it is cached on-device indefinitely (`admin-tempo-videos.tsx:219`). Anyone who obtains it can create, edit, and **delete** every tempo entry (`DELETE /api/tempo-videos/:id`, no confirmation server-side).
3. `ADMIN_TOKEN` being unset causes a `throw` *inside the request handler* rather than at boot — the server starts fine and only fails when someone hits an admin route.

**Fix:** compare with `crypto.timingSafeEqual` over fixed-length buffers (guard the length check first). Validate `ADMIN_TOKEN`, `JWT_SECRET`, and `DATABASE_URL` at startup in `index.ts` so misconfiguration fails fast. Log admin mutations with a request id.

---

### S5 — Wide-open CORS (Medium)

`app.ts:28` — `app.use(cors())` with no options. That sends `Access-Control-Allow-Origin: *` and, because the default reflects `Access-Control-Request-Headers`, it permits `authorization` and `x-admin-token` on cross-origin requests from **any website**.

Credentials aren't cookies here, so this is not classic CSRF — an attacker's page can't read a victim's bearer token out of another origin's storage. What it does enable:

- Any web page can use a visitor's browser as a free proxy to hammer the API (amplifies S1).
- Any page can brute-force `x-admin-token` from visitors' browsers, distributing the attempts across many IPs.
- Any page can call the public `GET /api/tempo-videos` and scrape the dataset.

**Fix:** `cors({ origin: [<the Expo web origin>], allowedHeaders: ["content-type","authorization","x-admin-token"], methods: [...] })`. Native apps don't send `Origin`, so restricting it costs nothing there.

---

### S6 — Reflected XSS via `X-Forwarded-Host` in the static server (Medium)

`artifacts/swing-tempo/server/serve.js:68-82`:

```js
const host = req.headers["x-forwarded-host"] || req.headers["host"];
const expsUrl = `${host}`;
const html = landingPageTemplate.replace(/EXPS_URL_PLACEHOLDER/g, expsUrl) ...
```

`EXPS_URL_PLACEHOLDER` is substituted into both an HTML attribute (`templates/landing-page.html:389`, `<a href="exps://EXPS_URL_PLACEHOLDER">`) and a **JavaScript string literal** (line 409, `const deepLink = "exps://EXPS_URL_PLACEHOLDER";`) with no escaping at all.

`X-Forwarded-Host` is fully attacker-controlled — Node performs no validation on it, unlike the `Host` header. A request carrying `X-Forwarded-Host: x";alert(document.cookie);//` breaks out of the JS string and executes. Exploitation requires the attacker to influence the header reaching the app (proxy misconfiguration, or an intermediate cache that keys on URL but varies the response by header → cache poisoning that hits every subsequent visitor).

**Fix:** validate the host against an allowlist, or at minimum reject anything not matching `/^[a-zA-Z0-9.\-:]+$/`, and HTML-escape before substitution. Prefer building the deep link client-side from `window.location.host`, which is not attacker-controlled.

---

### S7 — Unvalidated numerics in `/api/sync` crash the handler (Medium)

`SyncBody` (`lib/api-zod/src/generated/api.ts:108-126`) validates types but no ranges or formats. Three concrete 500s, all reachable by any authenticated user:

1. `sync.ts:52` — `timestamp: new Date(r.timestamp)`. Zod accepts any `number`. `{"timestamp": 1e30}` produces an Invalid Date; Drizzle/pg then throws a `RangeError` on serialization.
2. `accuracy` is `integer` in Postgres (`swingRecords.ts:29`) but `zod.number()` in the contract. `{"accuracy": 0.5}` reaches pg as a float for an `int4` column → `invalid input syntax` → 500.
3. `date` is validated as a bare `zod.string()` despite being documented as `YYYY-MM-DD`. Any string is stored, which silently corrupts every date-keyed feature (streaks, the contribution grid, the weekly recap) — see F7.

**Fix:** tighten the OpenAPI spec (it is the source of truth — do not hand-edit the generated files) with `format: date` + pattern on `date`, `minimum`/`maximum` on `timestamp`, `type: integer` with `minimum: 0, maximum: 100` on `accuracy`, and sane bounds on `ratio`/`duration`/`swings`. Then re-run codegen.

---

### S8 — `/api/sync` is unbounded, untransactional, and O(n) round-trips (Medium)

`sync.ts:23-61` loops over `sessions` and `swingRecords`, `await`-ing a separate `INSERT` per element. There is no cap on either array in `SyncBody`.

- `express.json()` uses the 100 kB default, which still allows on the order of 500–1000 swing records per request → 500–1000 sequential DB round-trips in one HTTP request, holding a pool connection the whole time. With no rate limiting (S1), a handful of concurrent requests exhausts the pg pool and stalls the API.
- No transaction wraps the loops. A failure partway through (see S7) leaves the account in a half-written state, and the client — which swallows all sync errors — never learns.
- The final `findMany` returns **every** record for the user with no pagination. At the client's 500-record cap that's fine; nothing enforces that cap server-side, so a crafted client can grow a row set without limit and make its own subsequent syncs progressively more expensive.

**Fix:** cap both arrays in the spec (e.g. `maxItems: 500`), batch the inserts into a single multi-row `INSERT ... ON CONFLICT` per table, and wrap the whole thing in `db.transaction()`.

---

### S9 — Account enumeration on signup (Medium)

`routes/auth.ts:37` returns `"An account with that email already exists."` Login (line 70) is correctly generic, so this is the only leak — but it is enough to test an email list against the user base. The response-time difference also leaks: the existing-email path skips bcrypt entirely and returns in milliseconds, while a successful signup takes ~300 ms.

**Fix:** return a generic "check your email to continue" and handle the collision out-of-band — this is the standard pattern, though it needs the email provider that `replit.md` notes isn't wired up yet. Failing that, at minimum equalise timing by hashing the password regardless.

---

### S10 — No security headers (Low)

Neither `app.ts` nor `serve.js` sets any. No `helmet`, no CSP, no `X-Content-Type-Options: nosniff`, no HSTS, no `Referrer-Policy`, no `X-Frame-Options`. The static server also serves `.map` sourcemaps publicly (`serve.js:35`), exposing original client source.

**Fix:** `app.use(helmet())` on the API; add a static header block in `serve.js` (a CSP there would also have blunted S6). Exclude `.map` from production output or gate it.

---

### S11 — JWT verification doesn't pin the algorithm (Low)

`middlewares/auth.ts:36` — `jwt.verify(token, getJwtSecret())`. No `algorithms: ["HS256"]`, no `issuer`, no `audience`.

This is **not** currently exploitable: `jsonwebtoken` v9 rejects `alg: none` by default, and the classic RS256→HS256 confusion needs a public key the attacker can obtain, which doesn't exist in an HMAC-only setup. It's defence-in-depth against a future change (e.g. moving to asymmetric keys) silently reopening the hole. There is also no minimum-length check on `JWT_SECRET`, so a short secret is accepted without complaint.

**Fix:** pass `{ algorithms: ["HS256"], issuer, audience }` to both `sign` and `verify`; assert `JWT_SECRET.length >= 32` at boot.

---

### S12 — Malformed UUID → unhandled 500 (Low)

`routes/tempoVideos.ts:70` and `:81` pass `String(req.params.id)` straight into `eq()` on a `uuid` column. A non-UUID id makes Postgres raise `22P02` (invalid input syntax for type uuid), which surfaces as a 500 rather than a 404. Not an injection — Drizzle parameterises — but it's noisy, and error-rate monitoring will be polluted by trivially-triggered 500s. `DELETE` also returns 204 for ids that never existed, so the client can't distinguish.

**Fix:** validate the param with `zod.string().uuid()` and return 400/404.

---

### S13 — No global error handler (Low)

There is no `app.use((err, req, res, next) => ...)`. Express 5 forwards rejected promises from async handlers to its *default* handler, which renders an HTML error page and includes the stack trace whenever `NODE_ENV !== "production"`.

The deployment config does set `NODE_ENV = "production"` (`artifacts/api-server/.replit-artifact/artifact.toml`), so stack traces are **not** currently leaking in the Replit deployment — this is Low for that reason. But the protection depends entirely on one env var in one config file, every 500 returns HTML to a JSON API client, and nothing logs the error with a request id.

**Fix:** add a terminal error middleware that logs via the pino instance and returns a JSON `{ error }` with a correlation id.

---

### S14 — Web tokens live in `localStorage` (Low)

`utils/tokenStorage.ts:10-13` correctly uses `expo-secure-store` on native (Keychain/Keystore) and falls back to AsyncStorage on web, which is `localStorage` — readable by any script on the origin. The file documents this trade-off honestly, and the web build is described as a preview, so the risk is bounded. Worth revisiting if web becomes a real target: the standard answer is an httpOnly refresh cookie, which would also want CSRF protection.

---

### S15 — 27 vulnerable transitive dependencies (Low)

`pnpm audit`: **1 low, 9 moderate, 17 high**. Spot-checked examples:

- `postcss < 8.5.10` (CVE-2026-41305, XSS via unescaped `</style>`) — via `@expo/cli > @expo/metro-config`
- `undici < 6.28.0` (cookie attribute injection) — via `@expo/cli`
- `esbuild >=0.27.3 <0.28.1` (arbitrary file read via dev server on Windows) — via `@workspace/api-server`, a **direct** devDependency

Almost all sit under `@expo/cli`, i.e. build-time tooling rather than shipped runtime code, which is why this is Low. The esbuild one is directly pinned in `artifacts/api-server/package.json:31` and is a one-line bump.

**Fix:** bump `esbuild` to `>=0.28.1`; run `pnpm update` for the Expo toolchain; add `pnpm audit --prod` to CI once CI exists (see F12).

---

### S16 / S17 — Informational

- **S16:** `cookie-parser` and `@types/cookie-parser` are dependencies of `api-server` but never imported. The app is stateless-bearer-token, so remove them — unused middleware is future foot-gun surface.
- **S17:** `GET /api/tempo-videos` (`tempoVideos.ts:34`) is public, unauthenticated, unpaginated, and uncached — it returns the whole table on every Tempos-tab mount. At ~56 rows that's fine; it just wants a `Cache-Control` header and eventually pagination.

---

## Part 2 — Feature completeness & implementation quality

### What's genuinely done and done well

- **Tempo engine** (`hooks/useTempoEngine.ts`). Absolute-time scheduler on a 10 ms tick, re-deriving position from wall-clock each pass rather than chaining `setTimeout`. This is the correct design for audio timing and the comment explains why. Best code in the repo.
- **Shared swing math** (`utils/swingAnalysis.ts`). Single source of truth for ratio/accuracy/grade across the Analysis screen, Compare screen, and history recording — exactly right, prevents threshold drift.
- **Sync merge semantics** (`routes/sync.ts`). `greatest()` for durations and `onConflictDoNothing` for immutable records is a thoughtful conflict strategy, well documented — though see S2 and F7 for where it goes wrong.
- **Local-first architecture.** AsyncStorage as the read source with background reconciliation means the app works fully offline and signed-out. Deliberate and correctly implemented.
- **Auth flows.** Signup/login/me/update-name/change-password are all implemented end-to-end with bcrypt cost 12, Zod validation on every body, and correct 401 handling. The gaps are the ones listed below, not the happy path.
- **Tempos tab.** DB-backed with a static fallback so the tab is never blank mid-fetch. Good pattern.
- **Admin screen.** Does the one job it claims: attach a YouTube id + clip start without a redeploy.

---

### F1 — Fabricated statistics shown to signed-in users (High)

`app/(tabs)/profile.tsx:561-565`:

```tsx
{ label: "Sessions",     value: "24"    },
{ label: "Best Ratio",   value: "3.1:1" },
{ label: "Avg Accuracy", value: "82%"   },
```

These are hardcoded. Every signed-in user sees "24 sessions, 3.1:1 best ratio, 82% average accuracy" on day one, forever, regardless of what they actually did — displayed in the most prominent card on the profile, directly under their name.

This is the worst finding in the feature audit. The app is a measurement tool; showing invented measurements undermines the entire product, and a new user has no way to know the numbers are fake. Every input needed to compute them for real is already in scope in this same component (`sessions`, `swingRecords`, `computeConsistency`, `computeClubBreakdown`).

**Fix:** compute from `swingRecords`/`sessions`, or delete the card. Do not ship it as-is.

---

### F2 — Swing library is in-memory only; every imported video is lost on app restart (High)

`context/SwingLibraryContext.tsx:43-46` holds `swings` and `proSwings` in plain `useState`. There is no AsyncStorage read or write anywhere in that file, and nothing else persists them.

Consequences:

- Every imported swing video, its markers, its name, and its thumbnail vanish when the app is closed. The Swing Lab is empty on every launch.
- The **Recent Swings** archive on the profile (`profile.tsx:508-524`) persists `SwingRecord` rows correctly and renders thumbnails — but tapping one calls `findSwing` (`profile.tsx:183`) against the empty in-memory library, so after any restart every card shows *"This swing is no longer in your library."* The feature is guaranteed to be broken in normal use.
- Compare mode requires two marked swings in the library, so it too is restart-fragile.

This is the single largest gap between what the app appears to do and what it does. `SwingRecord` (the analysis result) is persisted; `Swing` (the video + markers that produced it) is not.

**Fix:** persist the library to AsyncStorage the way `sessions`/`swingHistory` already are. Note that `Swing.uri` is a device file path from `ImagePicker` — on iOS those can be in a cache directory the OS may reclaim, so copy the picked file into `FileSystem.documentDirectory` on import before storing the path.

---

### F3 — Practice time is double-counted and inflated by app-idle time (High)

Two independent mechanisms write to the same daily bucket:

1. `useActiveTimeTracker` (`hooks/useActiveTimeTracker.ts`) adds seconds while the tempo is playing — correct, this is genuine active practice.
2. `recordSessionStart()` fires on the welcome screen's Start button (`welcome.tsx:61`), and `finalizeSession()` (`utils/sessions.ts:33`) adds `Date.now() - startMs` — **the whole wall-clock span**, including the same seconds mechanism 1 already counted.

Worse, `finalizeSession()` only ever runs from `welcome.tsx`'s mount effect (line 45), and `handleStart` uses `router.replace` — so the welcome screen is never revisited within a session. The finalize therefore happens on the *next app launch*, and `startMs` lives in AsyncStorage across launches. A user who taps Start, uses the app for 5 minutes, closes it, and comes back three days later has ~259,200 seconds (72 hours) of "practice" credited — to *today*, not to the day they actually practised.

Then S8's `greatest(local, server)` merge makes that corrupted value **permanently irreversible** across every device on the account. There is no endpoint or UI to correct it.

**Fix:** pick one mechanism. `useActiveTimeTracker` is the correct one — delete `recordSessionStart`/`finalizeSession` or repurpose them for foreground-time tracking gated on `AppState`. Clamp `duration` server-side to something physically possible per day (e.g. 86,400) and add a way to reset a day.

---

### F4 — "Pro Swings" tab renders dead, non-interactive cards (Medium)

`app/(tabs)/videos.tsx:41-46` builds `PRO_SWINGS` from the static `TEMPO_PLAYERS` array. These are `PlayerTempo` records — name, event, ratio, backswing, downswing. They have **no video URI**.

The `renderItem` (line 263) draws them as a `<View>`, not a `Pressable`. Tapping does nothing. There is no navigation, no playback, no analysis hand-off. In a tab whose entire purpose is "tap a swing to analyse it", the default tab is a wall of eight statically-rendered stat cards that don't respond to touch.

It also duplicates the Tempos tab's job while using the stale bundled array rather than the DB the Tempos tab reads from — so the two screens can disagree about the same player.

**Fix:** either wire these into the same `youtubeId`/deep-link path the Tempos tab uses, make them navigate to the tempo trainer, or remove the section and let "Import Pro Swing Video" stand alone.

---

### F5 — Password reset does not exist (Medium)

`profile.tsx:717-719` — the "Forgot Password?" link shows *"Password reset isn't set up yet — check back soon."* There is no `/auth/forgot-password` or `/auth/reset-password` route on the server and no token table.

`replit.md` explains the reason honestly (no transactional email provider is configured, which is also why auth is password-based rather than magic-link). That's a legitimate sequencing decision — but the consequence is that **any user who forgets their password permanently loses their account and all synced data**, with no recovery path and no support tooling. Combined with F9 (no account deletion), an account is currently a one-way door in both directions.

**Fix:** wire an email provider (Resend is already the suggested one), then a standard single-use, short-expiry, hashed-token reset flow. Bump `token_version` from S3 on completion.

---

### F6 — No account deletion or data export (Medium)

The `SETTINGS` array (`profile.tsx:69-95`) has exactly four items: Edit Profile, Security & Password, App Info, Sign Out. There is no delete-account and no data-export option, and no corresponding server route.

The DB is ready for it — `practice_sessions` and `swing_records` both cascade on user delete (`onDelete: "cascade"`). Only the endpoint and the UI are missing.

This matters beyond politeness: the app collects email addresses and behavioural data from users who, given the `.com.au` context, likely include Australian Privacy Act subjects and probably GDPR subjects. Both regimes expect deletion and access on request. Apple's App Store review guideline 5.1.1(v) **requires** in-app account deletion for any app that offers account creation — this will block App Store approval as-is.

**Fix:** `DELETE /api/auth/me` (re-authenticate with the current password first) and `GET /api/auth/me/export` returning the user's sessions + records as JSON. Add both to the settings list.

---

### F7 — All dates are computed in UTC, not local time (Medium)

`new Date().toISOString().slice(0, 10)` is used as "today" in at least five places: `sessions.ts:42`, `:62`, `:74`, `:83`, `swingHistory.ts:50`, and `profile.tsx`'s `daysAgoIso`.

`toISOString()` is always UTC. For a user in Australia (UTC+10/+11), the "day" rolls over at **10 or 11 a.m. local time**. So a morning practice session is filed under the previous day; an evening session on the 4th is filed as the 5th.

Everything keyed on that date is wrong for non-UTC users: the streak counter (`computeStreak`), the GitHub-style contribution grid, the "this week vs last week" recap, per-day drill-down, and the server's `(user, date)` upsert key. A user practising every evening at 9 p.m. AEST sees their streak break at random.

**Fix:** derive the local date (`toLocaleDateString("en-CA")` yields `YYYY-MM-DD` in local time, or use a date library). Migrate existing rows, or accept a one-time discontinuity and document it.

---

### F8 — Swing records can never be deleted (Medium)

`swingHistory.ts` exposes `getSwingRecords`, `saveSwingRecords`, and `addSwingRecord`. There is no delete. There is no `DELETE /api/sync` or per-record endpoint. `MAX_RECORDS = 500` with `records.slice(-MAX_RECORDS)` (line 54) silently discards the **oldest** records once the cap is hit — so history is capped but not manageable.

Worse, the two halves interact badly: local records past 500 are dropped, but the server retains them forever, and each sync returns the full server set (`sync.ts:65`) which the client then writes back wholesale (`useCloudSync.ts:46`) — **bypassing the 500 cap entirely**. The cap only applies to `addSwingRecord`, not to the sync write-back. So the local store grows unbounded for signed-in users, which is precisely the case the cap was written to prevent.

**Fix:** add delete (local + server), and apply the cap in `saveSwingRecords` rather than at the call site so every write path respects it.

---

### F9 — Cosmetic "SwingTempo Pro" badge and an ad placeholder with no product behind them (Low)

- `profile.tsx:554` shows a gold **"SwingTempo Pro"** badge to every signed-in user. There is no subscription system, no entitlement check, no payment integration. It's decoration that implies a paid tier.
- `welcome.tsx:112-116` renders a grey box labelled **"Advertisement"** with an image icon. No ad SDK, no ad network, no fill logic — just a placeholder occupying prime space above the primary CTA on the app's first screen.

Both are visible to end users and both promise things that don't exist. If the monetisation plan is real, build it; if not, remove them before any store submission.

---

### F10 — Video export is a share sheet, not an export (Low)

`analysis.tsx:479` calls `Sharing.shareAsync(activeSwing.uri)` — it shares the **original unmodified clip**. No tempo overlay, no markers, no beeps, nothing the app computed.

`replit.md` labels this a "v1" and correctly identifies the blocker (frame-accurate re-encode needs ffmpeg-kit, unavailable in Expo Go, requires a custom dev client). The engineering judgement is sound. The problem is purely presentational: the button says "Export" with no indication that the output is identical to the input, so a user who exports expecting to see their tempo analysis gets a plain video and reasonably concludes the feature is broken.

**Fix:** relabel to "Share Original Clip" until the real thing lands.

---

### F11 — Clip start/end plumbing is built but only half-wired (Low)

The `tempo_videos` table has `clipStartSec` **and** `clipEndSec` (`tempoVideos.ts:28-29`), both surfaced through the API and the DTO. But:

- `TempoVideoEmbed.tsx:20` uses only `clipStartSec` (as `&t=`) and destructures `clipEndSec` out of props without ever using it.
- The admin screen (`admin-tempo-videos.tsx:100-107`) has an input for start only — there is no way to set an end at all.
- Per the session history, 48 of ~56 entries now have verified YouTube ids ready to load, but none are in the DB yet.

So the column exists, the API carries it, and nothing can write or read it. Harmless, but it's dead weight that reads as a finished feature.

**Fix:** either add the end input and honour it in the embed, or drop `clipEndSec` until inline playback exists (a plain YouTube link can't enforce an end time anyway — that needs the iframe player, which was deliberately reverted).

---

### F12 — Zero tests, zero CI (Medium)

No test files anywhere in the repo (`*.test.*`, `*.spec.*`, `__tests__` all return nothing). No `.github/` directory, so no CI. `package.json` has `typecheck` and `build` but no `test` script.

For a codebase this size that's a defensible early-stage trade-off — but three specific areas are now complex enough that regressions will be silent:

- `utils/swingAnalysis.ts` — pure functions, trivially testable, and wrong output here corrupts every downstream statistic.
- `routes/sync.ts` — the merge semantics are subtle (`greatest`, `onConflictDoNothing`), and F3/F8 show they're already producing wrong results.
- `sessions.ts` streak/date logic — F7 is exactly the class of bug one unit test would have caught.

**Fix:** add vitest, cover those three modules, and add a GitHub Actions workflow running `typecheck` + `test` + `pnpm audit --prod`.

---

### F13 — Documentation is a half-filled template (Low)

`replit.md` is genuinely good where it's written — the "Architecture decisions" section is detailed and explains the *why* behind the local-first design, the auth choice, and the video-rights position. But the file still opens with `# [Project name]` and `_Replace the heading above..._`, and the **Product**, **User preferences**, and **Gotchas** sections are all unfilled placeholders.

Given the number of gotchas this audit found (UTC dates, double-counted sessions, in-memory library), that Gotchas section has earned its keep.

---

## Recommended order of work

**Before any public release:**

1. **F1** — delete or compute the fake profile stats (visible, misleading, ~30 min)
2. **S1** — add rate limiting (highest-value security fix, ~1 h)
3. **F2** — persist the swing library (largest functional gap)
4. **F3** — fix double-counted/inflated practice time, and clamp server-side
5. **S3** — token versioning so password change actually revokes
6. **S2** — composite key on `swing_records`

**Before App Store submission:**

7. **F6** — account deletion (hard requirement, guideline 5.1.1(v))
8. **F5** — password reset (needs the email provider first)
9. **F9** — remove the Pro badge and ad placeholder, or build them

**Then:**

10. **S4, S5, S6, S7** — timing-safe admin compare, CORS allowlist, host escaping, input bounds
11. **F7** — local-time dates (migration needed, so plan it)
12. **F8, F4, F10, F11** — record deletion, Pro Swings tab, export labelling, clip-end
13. **S8** — batch + transact the sync loop
14. **F12** — tests + CI
15. **S10–S17** — headers, alg pinning, dep bumps, cleanup
