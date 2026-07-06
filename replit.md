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

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- DB schema (source of truth): `lib/db/src/schema/` — one file per table, e.g. `users.ts`
- API contract (source of truth): `lib/api-spec/openapi.yaml` — edit this, then run the codegen command above; never hand-edit `lib/api-zod/src/generated/**` or `lib/api-client-react/src/generated/**`
- Account auth: `artifacts/api-server/src/routes/auth.ts` (signup/login/me) + `artifacts/api-server/src/middlewares/auth.ts` (bearer-token verification)

## Architecture decisions

- Auth is email + password (bcrypt-hashed, JWT bearer tokens), not magic-link/OTP, because no transactional email service is configured yet — password auth doesn't require sending mail to work. Revisit once an email provider (e.g. Resend) is wired up.
- Mobile app auth tokens should be persisted with `expo-secure-store` and supplied to `@workspace/api-client-react` via `setAuthTokenGetter`; the base API URL is set via `setBaseUrl` and must point at wherever `@workspace/api-server` is actually deployed.

## Product

_Describe the high-level user-facing capabilities of this app once they exist._

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

_Populate as you build — sharp edges, "always run X before Y" rules._

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
