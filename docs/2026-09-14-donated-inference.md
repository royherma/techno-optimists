# Donated inference — connect an AI account, spend your own credits on someone else's problem

Status: built and live (2026-09-14). This document is the argument and the
decisions; `apps/api/src/ai-accounts.ts` is what actually runs. Where they
disagree, the code is right.

## The idea

A thread describes a real problem. Running AI against it — structuring it,
researching it, drafting a plan, translating it — costs money. Today that money
is the site's. That caps how much AI any thread can get, and it makes the site
the bottleneck on its own best feature.

Instead: a reader connects their own AI account and the inference runs on their
credits. They are not donating cash to a company. They are donating compute to a
specific problem, and the thread shows who did it.

This is the same shape as bringing a tool to a barn raising. It is the most
on-brand contribution the site could accept.

## What actually exists to build this on

Verified 2026-09-14.

**OpenRouter OAuth PKCE — this is the mechanism.** `https://openrouter.ai/auth`
with `callback_url`, `code_challenge`, `code_challenge_method=S256`. The user
authorizes, we get a `code` (10 minute expiry), POST it to
`https://openrouter.ai/api/v1/auth/keys` with `{code, code_verifier,
code_challenge_method}` and receive `{ key }` — a user-controlled API key billed
to their OpenRouter balance. No client secret. Works from a Worker.
Source: https://openrouter.ai/docs/use-cases/oauth-pkce

**OpenAI has no equivalent.** There is no `/oauth/authorize` on the Platform API
that mints a key billed to a consumer's account. It is an open feature request,
not a product. The workarounds people cite — Codex OAuth, ChatGPT-account key
extraction — are reverse-engineered and against terms; Anthropic closed the
equivalent hole in April 2026 and Google did the same on Gemini CLI. We do not
build on those. If a user wants OpenAI models specifically, OpenRouter routes to
them on the user's OpenRouter balance, which is the legitimate version of the
same wish.
Sources: https://community.openai.com/t/feature-request-consumer-delegated-ai-access-let-third-party-apps-use-my-ai-subscription-via-oauth/1395942 ,
https://developers.openai.com/plugins/build/auth

So: **one provider at launch, OpenRouter, connected by OAuth.** A paste-your-key
box was planned as a fallback and is NOT built - `saveAccount` takes a key from
any source, so it is a form and a route when someone asks for it.

## The single mechanism

One concept in the product, one table, one connect button:

> **Connected account** — an AI account a person has linked to their profile,
> which the site may spend from on their behalf, only for work they initiate.

Everything else is a detail of how the key got there (OAuth or paste) and which
provider it points at. The UI says "Connect an AI account". It does not say
OAuth, PKCE, or API key.

## Flow

1. Signed-in person opens a thread, hits an AI action (Structure this / Research
   this / Translate). If they have no connected account, the button reads
   **Connect an AI account to run this** and goes to `/settings#compute`.
2. `/settings#compute` → **Connect an AI account**. We generate a `code_verifier`, store
   it server-side keyed to their session, redirect to `openrouter.ai/auth`.
3. They authorize. OpenRouter redirects to
   `https://technooptimists.org/api/ai/callback?code=…`.
4. Worker exchanges the code for a key, encrypts it, stores it, redirects back
   to wherever they were.
5. The AI action now runs. The thread records **"Researched by @mei, on her own
   credits."**

## Auth: the email question, answered

You asked what works for existing vs new users. The answer is that connecting an
AI account is **never a sign-in path**. It is an action a signed-in person takes.

Reason: OpenRouter's PKCE response is `{ key }`. It carries no verified email,
no user id, no identity claim at all. It proves someone authorized a key. It
does not prove who they are. Treating it as a login would let anyone with any
OpenRouter account take over a site account, or spawn ghost accounts with no
reachable address — and the whole `identities` table (`apps/api/src/auth.ts`,
`packages/db/schema.sql:141`) is built on email being the verified identity.

So the rule is one line:

> **Email magic-link is the only way to become a person. Connecting an AI
> account is a thing a person does, and requires a live session.**

That makes the existing/new-user matrix trivial:

| Who | What happens |
|---|---|
| Existing user, signed in | Connect button works immediately. Key attaches to their `person_id`. |
| Existing user, signed out | `/settings#compute` bounces to `/signin?next=/settings%23compute`. After the magic link, they land back on the connect page and continue. |
| New user, never signed in | Same bounce. They enter email, click the link, a person row is created by the existing callback, then they connect. Two steps, both familiar. |
| New user who clicks "connect" from a thread | `next` carries the thread URL, so after email + connect they are returned to the thread with the action ready to run. Nothing is lost. |
| Same person, second device | Keys are per-person, not per-session. Already connected. |

No new account-creation path, no email collision logic, no merge problem. That
is the whole point of refusing to treat the key as an identity.

## Edge cases

These are the ones that will actually bite.

**The code expires in 10 minutes.** Someone opens the authorize page, walks
away, comes back. The exchange 400s. Show "That took too long — connect again"
and re-issue, do not show a raw error.

**The verifier is gone.** Their session expired mid-flow, or they started the
flow in one browser and finished in another. The callback has a `code` but no
stored verifier for that session. Do not attempt the exchange — bounce to
`/signin?next=/settings%23compute` with "Sign in and connect again."

**Their balance is zero.** OpenRouter returns 402 on the inference call, not at
connect time, so this surfaces mid-action. The account stays connected; the run
fails with "Your OpenRouter balance is empty. Top up and run this again." Never
silently fall back to the site's own credits — that spends the house's money
without asking and makes the donation label a lie.

**They revoke the key on OpenRouter.** We find out on 401. Mark the account
disconnected, tell them once on their next AI action, never email about it.

**They connect, then delete their site account.** The key row cascades on
`person_id` like everything else. Also fire a best-effort delete against
OpenRouter so the key does not outlive the account.

**Two people connect the same OpenRouter account.** Allowed. A shared team
balance is a real thing and policing it needs an identity claim we do not have.
Attribution follows the site person, not the OpenRouter account.

**A thread gets AI work from three different donors.** Attribution is per-run,
recorded on the update, not a single "sponsor" field on the thread. A thread can
say "Structured by @mei · Researched by @sam".

**Prompt injection through thread content.** Thread text is attacker-controlled
and now runs against a *stranger's* paid account. Content goes in as data with a
fixed system prompt, model allowlist, hard max-tokens per run, and a per-run
cost ceiling. A donor must never be able to lose $40 because someone pasted a
novel into a thread.

**Rate limits.** Per person per hour, and per thread per day. The limit protects
the donor's wallet, so it is enforced even though it is their money.

**Concurrency.** Two people hit the same action on the same thread at once.
NOT yet built: today both runs happen and both are recorded, so two donors can
each pay for near-identical output. The per-thread daily limit bounds the waste.
A lock on `(thread, action)` is the fix when a thread ever sees that traffic.

**Non-JS / back button.** The callback is a plain GET redirect chain, so it
works without JS. Hitting back after connecting re-runs the callback with a
spent code — detect and redirect to `/settings?connected=1#compute` rather than
erroring. The fragment must stay LAST: `/settings#compute?connected=1` puts the
query inside the fragment, where `URLSearchParams` never sees it. That is what
`withParam()` in `apps/api/src/index.ts` exists for, and it was a real bug
caught by curling the deployed callback, not by the build.

## Data

One table. Additive migration in `scripts/migrate-community.mjs`, same
`IF NOT EXISTS` pattern as everything else there.

```sql
CREATE TABLE IF NOT EXISTS ai_accounts (
  person_id     TEXT PRIMARY KEY REFERENCES people(id) ON DELETE CASCADE,
  provider      TEXT NOT NULL DEFAULT 'openrouter',
  key_encrypted TEXT NOT NULL,   -- AES-GCM via WebCrypto, secret in AI_KEY_SECRET
  label         TEXT,            -- what OpenRouter shows the user, for their audit trail
  connected_at  TEXT NOT NULL DEFAULT (datetime('now')),
  last_used_at  TEXT,
  revoked_at    TEXT             -- set on 401; row kept so "reconnect" reads as reconnect
);

CREATE TABLE IF NOT EXISTS ai_runs (
  id            TEXT PRIMARY KEY,
  challenge_id  TEXT NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  person_id     TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  action        TEXT NOT NULL,   -- structure | research | translate
  model         TEXT NOT NULL,
  cost_usd      REAL,            -- reported by OpenRouter, for the donor's own total
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ai_runs_challenge ON ai_runs(challenge_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_runs_person ON ai_runs(person_id, created_at DESC);
```

The key is never returned to the browser after connect. `/api/auth/me` may say
*that* an account is connected and its label. Never the key.

`ai_runs` is what makes donation visible: a person's profile can show "12 runs
donated across 7 threads", which is the thing that makes anyone do this twice.

## Routes

- `GET  /api/ai/connect`  — requires session, mints verifier, 302 to OpenRouter
- `GET  /api/ai/callback` — exchanges code, stores key, 302 back to `next`
- `POST /api/ai/disconnect` — requires session, deletes row, best-effort revoke
- `POST /api/challenges/:slug/ai/:action` — runs the action on the caller's key

`/api/ai/*` goes in `run_worker_first` in `wrangler.jsonc` alongside `/api/*`
— already covered by the existing `/api/*` entry, so no config change, but the
cached-404 trap documented there is exactly the failure mode to watch for if
the callback ever appears to do nothing.

## Secrets

`AI_KEY_SECRET` — 32 random bytes, AES-GCM key for at-rest encryption of stored
keys. `wrangler secret put AI_KEY_SECRET --env prod` and the same for dev, with
**different values**, so a dev database leak cannot decrypt prod keys.

No OpenRouter client secret exists. PKCE is the whole point.

## Copy

Never "donate inference" in the UI — it is our word, not theirs. Use:

- Button: **Connect an AI account**
- Explainer, one line: *Run AI on this thread using your own credits. You keep
  control of the account and can disconnect any time.*
- Attribution on the update: *Researched by @mei, on her own credits.*
- Profile: *12 runs donated · 7 threads*

No "prototype", no "not built yet", no apology about balances.

## Build order

1. Migration + `ai_accounts` table + encryption helper.
2. `/api/ai/connect` and `/api/ai/callback`, `/settings#compute` page, connect and
   disconnect working end to end. Ship to dev, connect a real account, verify.
3. One AI action — **Structure this** — on the caller's key, with cost ceiling,
   model allowlist, and the `ai_runs` row.
4. Attribution on the thread and the profile count.
5. The other actions.

Step 2 is the whole risk. Everything after it is ordinary.

## What would make this fail

Not the auth. The auth is a day. It fails if the AI actions are not worth
spending someone else's money on — if "Structure this" produces a worse version
of what the person already wrote. Build step 3 against a real thread with a real
donor watching before building steps 4 and 5.
