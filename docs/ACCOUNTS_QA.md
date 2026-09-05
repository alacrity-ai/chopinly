# Chopinly accounts + sync + landing — QA record (WSHED-55, 2026-09-04)

Everything below ran against **production** (`https://chopinly.com`) after each
phase's deploy, and against `wrangler pages dev` (Miniflare + local D1) before.
Scripts live in `tests/e2e/`; screenshots are attached to the WSHED cards.

## Suites

| Suite | Steps | Prod result | Local result |
|---|---|---|---|
| `anonymous.mjs` — the app without an account (Logbook v2 driver + WSHED-42…47 checks) | 23 | 23/23 | 23/23 |
| `accounts-sync.mjs` — two isolated browser contexts on one account | 6 | 6/6 | 6/6 |
| `account-ui.mjs` — the navbar button + account sheet | 6 | 6/6 | 6/6 |
| `landing.mjs` — `/welcome`, OG, first-run redirect | 4 | 4/4 | 4/4 |
| Unit (`npm test`, incl. `tests/merge.test.mjs`) | 56 | — | 56/56 |

## What the accounts suites prove

**accounts-sync.mjs** (throwaway `bot-…@e2e.chopinly.com`, deleted at the end)

1. Device A has anonymous data (goal, note, 25 min added, clock running) → signs in → status `synced`, nothing pending, cursor ≥ 4.
2. Device B signs in with the same account → sees the goal, the note, the minutes and **the running clock** (hero shows *running*).
3. B stops the clock → A's next sync shows idle: a closed segment beats an open one.
4. B goes offline and adds a note (status `offline`, 1 pending); A renames the goal; B reconnects → both hold the rename and both notes.
5. A deletes a note → B loses it (tombstone). Both go offline and both press play on different goals → after reconnecting exactly one clock survives on both devices (the later start), the other is closed at that instant.
6. `GET /api/me/export` matches (2 goals, the account email); B signs out and **keeps its local data** while `/api/me` is 401; A deletes the account → 401; signing in again creates a fresh empty account.

**account-ui.mjs**

1. Signed-out button shows the person glyph and no dot; the page never widens.
2. Bad email → *that doesn't look like an email address*; good email → code form with *we sent a code to …*.
3. Local: the echoed dev code types in and auto-submits at six digits. Prod: a wrong code → *that code didn't match*; then the allowlist sign-in behind the sheet. Either way the button flips to the initial with a **brass** dot.
4. A Logbook change flips the dot to **pending**, then back to **synced** after the debounce.
5. Signed-in sheet shows the email, *synced just now*, the export link; **sign out keeps local data**.
6. Cleanup through the API.

**landing.mjs**

1. A fresh visitor at `/` lands on `/welcome`; OG tags present; `/og/chopinly.png` is 200, 1200×630; no horizontal scroll (mobile).
2. *Open Chopinly* → the app at `/?app=1`; a later plain `/` stays in the app (seen).
3. A visitor with practice data but no seen flag is **not** redirected.
4. Desktop landing renders without horizontal scroll.

## Auth checks done by hand (curl, P1)

Wrong code 400 · reused code 400 (*expired — send a new one*) · missing `X-Chopinly` header 403 · `/api/me` without cookie 401 · sign-out → 401 · allowlist with a non-allowlisted domain rejected · sixth code request within an hour 429 · a real code delivered to Leif's address via `mg.kbrelay.com`.

## Known limits (by design)

- The E2E allowlist (`E2E_SECRET` + `@e2e.chopinly.com`) is the only way to sign in without a mailbox; the domain does not deliver mail.
- `migrations/*.sql`, `wrangler.toml` and `docs/*.md` are served as static files by Pages (no secrets in them). `functions/` is not.
- Mail goes out from `mg.kbrelay.com` until WSHED-56.
