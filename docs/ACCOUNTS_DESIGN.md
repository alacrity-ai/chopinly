# Chopinly — accounts, cloud sync and the landing page (WSHED-48)

**Status:** approved by Leif's standing instruction ("answer all open questions … land the entire thing", 2026-09-04).
**Brief:** *"I am fearful of losing my data. It's time we create user accounts with persisted data in the cloud."* Using kbRelay as the reference (hosted, self-serve registration, login, persistence), Chopinly needs: registration, login, a clean free-app landing page, an OG image, email confirmation through kbRelay's Mailgun key for now, and Cloudflare storage (KV or D1 — our call).

## 0. Principles

1. **Nothing changes for the musician who never signs in.** The app stays local-first and anonymous. An account adds *backup and multi-device*, nothing else. No feature is gated behind sign-in.
2. **Signing in must never lose local data.** The first sync after sign-in uploads everything already on the device and merges it with whatever the account holds. There is no "replace" path.
3. **The north star still applies** (LOGBOOK_V2_DESIGN §0.1): capture more without asking for more. Sign-in is one email and one six-digit code. No password, no profile form, no name.
4. **Same origin, same shell.** The API lives on `chopinly.com/api/*` inside the Pages project. Cookies are first-party, offline keeps working, and there is one deploy.

## 1. Open questions — decided

| Question | Decision | Why |
|---|---|---|
| Password or passwordless? | **Passwordless: email + 6-digit code.** | One flow is registration, login *and* confirmation. Nothing to reset, no password hashes to protect, and the musician is on a phone with the mail app one swipe away. A magic *link* was rejected: on iOS a link opens Safari, not the installed PWA, so the session would land in the wrong context. A code is typed wherever the app is. |
| KV or D1? | **D1 only.** | Sync needs read-your-writes and atomic merges. KV is eventually consistent; two devices writing within a minute could lose a segment. D1 gives transactions (`batch`) and `RETURNING`. Data volume is tiny (years of practice ≈ a few thousand rows per user). |
| Worker or Pages Functions? | **Pages Functions** in the existing `woodshed` project (`functions/api/[[route]].js`). | First-party cookies, one domain, one deploy, no CORS. kbRelay is a separate Worker because it has a real API surface for agents; Chopinly's API is private to its own shell. |
| Does the navbar need a new element? | **Yes — one.** A round *account* button at the right end of the top row (after the tool picker). Signed out: a thin person glyph. Signed in: the email's initial in a brass ring, with a small status dot (brass = synced, dim = pending, felt = error/offline). Tap → the account sheet. | The nav already carries brand + tool picker + the Logbook strip; a single 2.75 rem circle is the smallest honest affordance. The session chip stays where it is. |
| What syncs? | **The Logbook document**: goals, segments, notes, tombstones. Not tool settings (bpm, voice), not the active tool, not sight-singing campaign progress. | The Logbook is the data Leif fears losing. Settings are per-device by nature. Campaign progress can follow later as a generic `blob` entity kind (the envelope already allows it). |
| Merge strategy? | **Entity-level last-write-wins with tombstones**, plus one domain rule: a *closed* segment beats an *open* one regardless of timestamps. | Goals, segments and notes are independent rows with ids; the only real conflict is "stopped on one device, still running on another", and *stopped wins* is the answer a musician expects. |
| Landing page location? | ~~**`/welcome`**~~ **Superseded 2026-09-06 (WSHED-95): the landing is `index.html` at `/` and the app is `app.html` at `/app`; `/welcome` 301s to `/`. See `SEO_DESIGN.md` §1 for why moving the app broke nothing.** Original: **`/welcome`** (static `welcome.html`). The app stays at `/`. First-time visitors with no local data and not in standalone mode are redirected from `/` to `/welcome`. | Installed PWAs, bookmarks, the service worker scope and the manifest `start_url` all point at `/`. Moving the app would break every existing install. |
| Email sender? | `Chopinly <hello@mg.chopinly.com>` via Chopinly's own Mailgun domain (WSHED-56, live 2026-09-05). Launched on kbRelay's key as a stopgap. | Leif's instruction. |
| Session length? | **180 days, HttpOnly, Secure, SameSite=Lax**, sliding (re-issued when older than 30 days on any authenticated call). | A practice app opened daily should not ask for a code every week. |
| Account deletion / export? | Both in the account sheet. `DELETE /api/me` wipes every row; `GET /api/me/export` returns the merged document as JSON. | Free app, no lock-in. "Your data is yours" is on the landing page, so it must be true. |
| Bot / abuse protection? | Rate limits in D1 (per email and per IP), 5 attempts per code, codes expire in 10 minutes, generic responses. No Turnstile. | Proportionate to a free app with no payment surface. |
| Automated sign-in for E2E? | An `E2E_SECRET` env var lets `POST /api/auth/verify` skip the code **only** for addresses under `@e2e.chopinly.com` (a non-deliverable domain). | Production E2E must exercise the real flow without a mailbox. The allowlisted domain makes the backdoor useless for anyone else. |

## 2. Architecture

```
chopinly.com (Cloudflare Pages project "woodshed")
├── /                 static app shell (index.html, js/, css/, sw.js)
├── /welcome          static landing (welcome.html) + /og/chopinly.png
└── /api/*            Pages Functions (functions/api/[[route]].js)
        ├── D1 "chopinly"      users · sessions · login_codes · rate_limits · entities
        └── Mailgun            mg.chopinly.com
```

- `wrangler.toml` at the repo root: `pages_build_output_dir = "."`, `[[d1_databases]] binding = "DB"`, `[vars] MAILGUN_DOMAIN`, secrets `MAILGUN_KEY`, `E2E_SECRET` set with `wrangler pages secret put`.
- The service worker never touches `/api/*` (bypass in the fetch handler); `_headers` adds `Cache-Control: no-store` for `/api/*`.
- Shared code: `js/lib/merge.js` holds the merge rule and is imported by **both** the browser (`js/lib/logbook.js`) and the function (`functions/api/...`), so the two sides can never disagree.

## 3. Data model (D1)

```sql
users        (id TEXT PK, email TEXT UNIQUE, created_at INTEGER, last_seen_at INTEGER, rev INTEGER NOT NULL DEFAULT 0)
sessions     (id TEXT PK /* sha256(token) */, user_id TEXT, created_at INTEGER, renewed_at INTEGER, expires_at INTEGER, ua TEXT)
login_codes  (id TEXT PK, email TEXT, code_hash TEXT, created_at INTEGER, expires_at INTEGER, attempts INTEGER DEFAULT 0, used_at INTEGER)
rate_limits  (key TEXT PK /* "email:<e>" | "ip:<ip>" */, window_start INTEGER, count INTEGER)
entities     (user_id TEXT, kind TEXT /* goal|segment|note */, id TEXT, body TEXT /* JSON */,
              updated_at INTEGER, deleted INTEGER DEFAULT 0, rev INTEGER, PRIMARY KEY (user_id, kind, id))
              + INDEX entities_user_rev (user_id, rev)
```

`users.rev` is a per-user monotonic counter. Every write to `entities` takes the next rev inside one D1 batch (a transaction), so a client's `cursor` is exact: *"give me every row with `rev > cursor`"* can never skip a write.

## 4. The sync protocol

### 4.1 Envelope

```json
{ "kind": "segment", "id": "…", "updatedAt": 1788554000000, "deleted": 0,
  "body": { "goalId": "…", "startedAt": …, "endedAt": null, "bpm": null, "auto": null } }
```

Tombstones are envelopes with `deleted: 1` and no body. `updatedAt` is the client's clock at the time of the change (the same device stamps its own edits consistently; cross-device skew only matters when two devices edit the *same* entity within the skew window, which for practice data is practically never).

### 4.2 Merge rule (`js/lib/merge.js`, `pick(a, b)`)

1. Only one side exists → that one.
2. Exactly one is deleted → the newer `updatedAt` wins; on a tie the tombstone wins.
3. `kind === "segment"` and exactly one is open (`endedAt === null`) → **the closed one wins**.
4. Otherwise the newer `updatedAt`; on a tie the lexically larger JSON (deterministic, order-independent).

`pick` is commutative and associative for our purposes, so client and server converge whatever the order of syncs.

### 4.3 `POST /api/sync`

Request `{ cursor: number, changes: Envelope[] }` — the client's last cursor and its pending changes (everything on first sync).
Server, in **one batch**:

1. Read the existing rows for the incoming `(kind,id)` pairs (chunked ≤ 90 ids per `IN` — D1's 100-bind cap).
2. `pick(existing, incoming)` in JS; keep only the changes where the pick is the incoming one.
3. `UPDATE users SET rev = rev + N WHERE id = ? RETURNING rev`, then `N` upserts with `rev = new_rev - N + k`.
4. Select `entities WHERE user_id = ? AND rev > cursor ORDER BY rev`, return `{ cursor: maxRev, changes: [...] }`.

Response is the full set of rows changed since the client's cursor, which includes echoes of its own writes (harmless: `pick` is idempotent).

### 4.4 Client engine (`js/lib/sync.js`)

- **Pending set:** `logbook` records every locally stamped or tombstoned `kind:id` in `doc.pending` (persisted with the document, so a closed tab loses nothing).
- **Push + pull in one call.** On success: clear the pending ids that were sent, apply the returned changes through `logbook.applyRemote(envelopes)` (which uses `pick`, records tombstones, and **normalises multiple open segments** — if two devices started while offline, the later-started stays open and the earlier is closed at that instant), store the cursor in `ws.sync.state`.
- **Triggers:** any `logbook` change (debounced 1.5 s), `visibilitychange → visible`, `online`, `focus`, app start, and every 60 s while a segment is running (so the running clock is on the other device too).
- **Status:** `signed-out | idle | syncing | synced | offline | error`, exposed via `sync.on(fn)` for the navbar dot and the account sheet.
- **Sign-in bootstrap:** on `verify` success, mark *every* local entity pending and sync — this is what uploads years of local history on first sign-in, and what merges it with a second device's account data.
- **Sign-out:** clears the cursor and the session; **local data stays** (the device is still the musician's). A "sign out and clear this device" option exists for shared computers.

## 5. Auth

| Endpoint | Body | Behaviour |
|---|---|---|
| `POST /api/auth/code` | `{ email }` | Normalise (trim, lowercase, RFC-ish check). Rate limits: 5 per email per hour, 30 per IP per hour. Create `login_codes` row (`code_hash = sha256(code + salt)`, 10 min). Send Mailgun mail. Always `{ ok: true }` (never reveals whether the address is known). |
| `POST /api/auth/verify` | `{ email, code }` | Find the newest unused, unexpired code for the email; `attempts ≤ 5`; constant-time compare. Find-or-create the user; mint a session (32 random bytes, base64url; store sha256); `Set-Cookie chopinly_session=…; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=15552000`. Returns `{ user }`. E2E allowlist as in §1. |
| `GET /api/me` | — | `{ user }` or 401. Sliding renewal: re-issues the cookie when `renewed_at` is older than 30 days. |
| `POST /api/auth/signout` | — | Deletes the session row, clears the cookie. |
| `DELETE /api/me` | — | Deletes entities, sessions, codes, user. |
| `GET /api/me/export` | — | The merged document as JSON (`schemaVersion 2` shape, for re-import by hand if ever needed). |
| `GET /api/health` | — | `{ ok, db: true }`. |

CSRF: every mutating call must carry `X-Chopinly: 1` and a JSON content type; the function also checks `Origin` against the request host. Cookies are `SameSite=Lax`, so a cross-site form post never carries them anyway.

**The email** — subject `Your Chopinly code: 482 913`, plain text first, minimal HTML in the app's palette (ebony ground, ivory text, the code in brass). No links: nothing to phish.

## 6. UI

### 6.1 Navbar account button
`<button class="icon-btn account-btn" id="account-btn">` after the tool picker. States:

- **signed out:** person glyph (new icon `user` in `icons.js`, same 1.8 stroke as the set), `aria-label="account — sign in to back up your practice"`.
- **signed in:** the first letter of the email in Fraunces inside a brass ring; `aria-label="account · <email> · synced just now"`.
- **status dot** (bottom-right, 0.45 rem): brass = synced, ivory-dim = pending/syncing (breathes), felt = error/offline with pending changes. Hidden when signed out.

### 6.2 Account sheet (`js/ui/account.js`, reuses `openSheet`)
- **Signed out:** one line of copy — *"Back up your practice and pick it up on any device. Free."* — an email field, **send code**. Then a six-digit field (`inputmode=numeric`, `autocomplete=one-time-code`), **sign in**, and *"didn't get it? send again"* (respects the rate limit). Success: toast *"signed in"*, haptic, the sheet closes, the navbar ring **stamps** (the sticker move), and the first sync runs.
- **Takes (WSHED-75):** a fourth entity kind `take` syncs like the others — metadata only (goal, time, length, star, a 48-number peaks outline). The audio blob lives in IndexedDB on the recording device and never syncs; see `docs/TAKES_DESIGN.md`.
- **Signed in:** the email, the sync line (*"synced just now" / "3 changes waiting" / "offline — will sync when you're back"*), then a settings-style list (WSHED-62): full-width rows of equal height, a vector icon, a label and a one-line hint — **appearance** (WSHED-71: opens the skin picker, see `docs/DESIGN.md` §4; the row's hint names the current skin) · **sync now** · **download my data** · **show homepage** (`/welcome`); **sign out** (*keeps what's on this device*) · **sign out & clear this device**; and a felt-red **delete account** row behind a confirm. The signed-out sheet carries the **appearance** row too (a skin is a device setting, not an account one) and ends with a quiet *see the homepage* link.
- Errors are sentences, not codes: *"that code didn't match"*, *"that code has expired — send a new one"*, *"too many tries — wait a bit"*.

### 6.3 Landing page `/welcome` (now `/` — WSHED-95, see SEO_DESIGN.md)
Static, no JS beyond the "open" button. Sections, top to bottom, in the app's typography and palette:

1. **Hero:** wordmark *Chopinly*, tagline *practice assistant*, one sentence — *"Choose something. Practice it. See what you actually did."* — and a brass **Open Chopinly** button (`/?app=1`). Under it: *free · no ads · works offline · optional account for backup*.
2. **Three beats** with the app's glyphs: **the clock is always on a goal** (● ▲ ◆), **notes where they belong**, **history that reconstructs the day**.
3. **A screenshot strip:** Today (running), the bow, the goal page — the E2E driver's real captures.
4. **The tools:** metronome, pitch pipe, tuner, sight singing, Logbook — one line each.
5. **Your data is yours:** local first, optional sign-in with an email code, export or delete any time.
6. Footer: *made by LaLa Solutions* · link to the app.

OG: `og:title` *Chopinly — practice assistant*, `og:description` the one sentence, `og:image` `https://chopinly.com/og/chopinly.png` (1200×630, rendered from `dev/og.html` by Playwright: ebony ground, the pendulum icon, the wordmark, the tagline). The same tags go on `index.html` so a shared app link previews identically.

**First-run redirect** (`app.js`): if `ws.shell.seen` is unset **and** the Logbook has no goals and no segments **and** `display-mode` is not `standalone` **and** the URL has no `?app` **and** there is no session cookie hint (`ws.sync.state.user` unset) → `location.replace("/welcome")`. Every other load sets `ws.shell.seen`. Crawlers therefore see the app shell's OG tags at `/` and the landing's at `/welcome`.

## 7. Security notes

- Session tokens are 256-bit random, stored hashed; the cookie is HttpOnly so the shell never sees it. `fetch` calls use `credentials: "same-origin"`.
- Codes are stored hashed with a per-row salt, single-use, expire in 10 min, 5 attempts.
- Rate limits live in D1 (`rate_limits`) with a fixed hourly window — good enough at this scale, and the only state the function needs.
- No PII beyond the email. The export and delete endpoints keep the "your data is yours" promise literal.
- Secrets only through `wrangler pages secret put` (values from `agentsecrets`, never in the repo).

## 8. Offline and the PWA

- The shell and the Logbook are unchanged offline; sync simply waits for `online`.
- The SW bypasses `/api/*`; nothing about auth is cached. A 401 from `/api/me` on start flips the account state to signed-out without touching local data.
- `overscroll-behavior: none` and the ceremonies (WSHED-47) are untouched.

## 9. Testing

- **Unit** (`tests/merge.test.mjs`, `tests/logbook.test.mjs`): `pick` commutativity and the four rules; `pending` bookkeeping; `applyRemote` incl. two-open-segments normalisation; `exportEnvelopes`.
- **Local E2E** against `wrangler pages dev . --local` (Miniflare D1 with migrations applied): sign in via the E2E allowlist, create data on context A, sign in on context B, assert merge both ways, stop-on-B closes A's running segment, sign out keeps local data, delete wipes.
- **Prod E2E** against chopinly.com with a throwaway `@e2e.chopinly.com` account: the same script, then `DELETE /api/me` to clean up.
- Existing 23-step driver keeps running unchanged (anonymous path).

## 10. Out of scope (spin-offs)

- ~~`mg.chopinly.com` Mailgun domain + key (Leif; WSHED-56).~~ Done 2026-09-05.
- Syncing sight-singing campaign progress and tool settings (`blob` kind; later).
- Sharing / teacher views / multi-tenant anything. Chopinly is single-user by design.
