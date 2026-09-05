# Chopinly — accounts + sync + landing: implementation plan (WSHED-48)

Companion to [ACCOUNTS_DESIGN.md](ACCOUNTS_DESIGN.md). Six phases, each its own ticket, each landing on `main` behind the existing E2E gate. Anonymous use never breaks at any phase.

**Repo** `~/lets-get-rich/woodshed`, persona `leifktaylor`, Pages project `woodshed`, hosts `chopinly.com` (+ legacy alias). Deploy with `npm run deploy` (added in P0). Secrets via `agentsecrets` → `wrangler pages secret put`.

## Phase 0 — backend foundation (WSHED-49)

**Goal:** the Pages project gains a D1-backed API at `/api/*` without touching the app.

1. `wrangler.toml` (repo root):
   ```toml
   name = "woodshed"
   compatibility_date = "2026-05-01"
   compatibility_flags = ["nodejs_compat"]
   pages_build_output_dir = "."
   [[d1_databases]]
   binding = "DB"
   database_name = "chopinly"
   database_id = "<from wrangler d1 create>"
   migrations_dir = "migrations"
   [vars]
   MAILGUN_DOMAIN = "mg.chopinly.com"
   MAIL_FROM = "Chopinly <hello@mg.chopinly.com>"
   ```
2. `wrangler d1 create chopinly` (token `cloudflare_api_token`), id into the toml, `migrations/0001_init.sql` (§3 of the design), `wrangler d1 migrations apply chopinly --remote`.
3. `functions/api/[[route]].js`: tiny router (method + path → handler), JSON helpers, error envelope `{ error: "sentence" }`, `GET /api/health` doing `SELECT 1`.
4. `sw.js`: `if (url.pathname.startsWith("/api/")) return;` before the cache logic. `_headers`: `/api/*  Cache-Control: no-store`. Cache name → `chopinly-v17`.
5. `package.json`: `"deploy": "wrangler pages deploy . --project-name woodshed --branch main"`, `"dev": "wrangler pages dev . --local"`, `"db:migrate": "wrangler d1 migrations apply chopinly --remote"`. `.gitignore` `.wrangler/`.
6. Verify: `curl https://chopinly.com/api/health` → `{"ok":true,"db":true}`; the static app unchanged (E2E 23/23); `functions/` not served as static.

## Phase 1 — passwordless auth (WSHED-50)

1. `functions/lib/db.js` (queries), `functions/lib/crypto.js` (sha256, random token, constant-time compare), `functions/lib/mail.js` (Mailgun, ported from kbRelay's `mailgun.ts`; short-circuits and logs when `MAILGUN_KEY` is unset), `functions/lib/session.js` (cookie build/parse, `requireUser(ctx)`).
2. Routes: `POST /api/auth/code`, `POST /api/auth/verify`, `GET /api/me`, `POST /api/auth/signout`, `DELETE /api/me`, `GET /api/me/export` (returns an empty doc until P3).
3. Rate limits (`rate_limits` table, hourly window), attempts, expiry, single-use, E2E allowlist (`E2E_SECRET`, `@e2e.chopinly.com`).
4. Secrets: `MAILGUN_KEY` ← `agentsecrets get chopinly_mailgun_sending_key` (mg.chopinly.com since WSHED-56, 2026-09-05; the first days ran on kbRelay's key); `E2E_SECRET` ← freshly generated, stored in agentsecrets as `chopinly_e2e_secret`.
5. Verify: `curl` the code flow with a real address (Leif's) once; E2E allowlist sign-in returns a cookie; `GET /api/me` 401 → 200.

## Phase 2 — Logbook sync-readiness (WSHED-51)

1. `js/lib/merge.js`: `pick(a, b)`, `toEnvelope(kind, obj)`, `fromEnvelope(env)`.
2. `js/lib/logbook.js`:
   - `stamp()` every segment and note mutation (`start`, `closeRunning`, `stampTempo`, `addTime`, `addAuto`, `addNote`); tombstones get `updatedAt`.
   - `doc.pending: string[]` (`"kind:id"`), appended by `stamp`/`tomb`, deduped; `schemaVersion` stays 2 (additive fields; `migrate` fills `pending: []`).
   - `pendingEnvelopes()`, `allEnvelopes()`, `markAllPending()`, `clearPending(ids)`, `applyRemote(envelopes)` → `{ applied }` with open-segment normalisation, `replaceDoc` **not** provided (no replace path by design).
3. Unit tests: merge rules, pending bookkeeping, `applyRemote` cases (new, newer, older, tombstone, closed-beats-open, two-open normalisation).

## Phase 3 — sync API + client engine (WSHED-52)

1. `POST /api/sync` per design §4.3 (chunked reads, batch write with `RETURNING`, cursor response). `GET /api/me/export` now assembles the doc from `entities`.
2. `js/lib/sync.js`: state machine + triggers + debounce + `on(fn)`; `account.js`: `me()`, `requestCode`, `verify`, `signOut`, `deleteAccount`, `exportUrl`. Both are plain modules with `fetch(…, { credentials: "same-origin", headers: { "X-Chopinly": "1" } })`.
3. `app.js`: boot → `account.me()` → if signed in, `sync.start()`.
4. Local E2E harness: `npm run dev` (Miniflare D1 + migrations `--local`), the E2E allowlist secret in `.dev.vars` (git-ignored).
5. Verify: two browser contexts merge both ways; stop-on-B closes A; offline queueing.

## Phase 4 — navbar account button + account sheet (WSHED-53)

1. `icons.js`: `user` glyph. `index.html`: `#account-btn` after the tool picker. CSS: `.account-btn`, `.account-initial`, `.account-dot` states, reduced-motion.
2. `js/ui/account.js`: the sheet (signed-out and signed-in states), errors as sentences, the stamp on sign-in, *sign out* vs *sign out and clear this device*.
3. First-sign-in bootstrap: `logbook.markAllPending()` → `sync.now()`.
4. Verify: mobile layout (no page widening), keyboard flow on desktop, screen-reader labels.

## Phase 5 — landing page + OG (WSHED-54)

1. `welcome.html` + `css/welcome.css` (shares the tokens; no app JS). Screenshots from the E2E run copied to `/img/landing/*.png` (mobile, 2× DPR, cropped).
2. `dev/og.html` art board → `og/chopinly.png` via Playwright (1200×630). OG/Twitter tags on `welcome.html` and `index.html`.
3. `app.js` first-run redirect (design §6.3); `?app=1` sets `ws.shell.seen`.
4. `sw.js`: precache nothing new (landing is network-only). `_headers`: `/og/*` and `/img/*` long-cache.
5. Verify: fresh context at `/` → `/welcome`; installed/standalone stays on `/`; returning user stays on `/`; OG tags fetchable with `curl`.

## Phase 6 — QA, docs, handoff (WSHED-55)

1. Extend the E2E driver with an `accounts` block (local: Miniflare; prod: chopinly.com with the E2E allowlist) — sign in, seed, second context, merge assertions, sign out, delete.
2. `docs/ACCOUNTS_QA.md` with the step record and screenshots; README "Accounts" section; DESIGN.md §7 pointer; memory note.
3. Prod deploy, `npm run db:migrate`, secrets set, E2E green, handoff on each ticket, epic note.

## Commit / deploy discipline

One branch per phase (`WSHED-NN-…`), PR to `main`, `npm test` + local E2E green before push, prod E2E after deploy (wait ~1 min for the edge), review handoff to Leif on every card, **done only when Leif says**.

## Risks

| Risk | Mitigation |
|---|---|
| `pages_build_output_dir = "."` uploads `functions/`, `migrations/`, `tests/` as static files | Wrangler skips `functions/`; the rest is harmless text. Verified after P0 deploy by fetching `/functions/api/[[route]].js` (must 404). |
| A stale SW serving old JS against a new API | Cache name bumps per phase; the API is versionless and additive during this epic. |
| Clock skew between devices | Only matters for edits to the same entity within the skew; the closed-beats-open rule covers the one case that matters. |
| Mailgun stopgap domain lands in spam | Plain-text-first mail, no links, the code in the subject. Spin-off for `mg.chopinly.com`. |
| D1 100-bind cap | All `IN (...)` reads chunked at 90 (memory: `d1-100-bind-parameter-cap`). |
