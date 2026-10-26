# Five readers for one thread

Prepare one small distribution test: Roy invites five people he already knows who
care about urban nature, making things, or practical local problems. Each gets
the same thread and a direct invitation to reply. No mailing list or public
announcement is needed. Sending requires Roy's approval; this is the prepared
experiment, not a record of invitations sent.

This follows the experiment proposed in the [project brief](../PROJECT_BRIEF.yaml): verify browsing,
classify the content, and prepare one distribution test around a real problem.
The [product concept](2026-09-10-concept.md) remains the source of truth.

## Number to move

The supplied baseline is **42 visits and 0 sign-ups over the last seven full
days**; use is not measured. The hypothesis is that a specific, approachable
thread will bring interested readers in and give them a reason to respond.
The first decision is whether anyone finds a reason to read or contribute.

The existing reports count visitor-days and outside sign-in requests, respectively,
not unique people and completed registrations. Do not turn 0/42 into a verified
signup conversion rate. Five invitations are a proposed batch size, not a new
growth target or a replacement for the brief's contributor goal.

## Thread and audience

Use [Sparrows in Chennai lack nesting spaces](https://technooptimists.org/c/scout-51c0cb67ac3c0ef2b9c1d3fe).
It offers a concrete question a curious reader can discuss without being an
engineer: what would make a nest-box project work in another neighborhood?

This is an imported article shared by `@atlas`, not a first-person community
submission. [The original report](https://thebetterindia.com/sustainability/sparrow-friendly-school-campus-koodugal-ganeshan-chennai-sparrow-conservation-nest-box-12670515)
describes school campuses and nest boxes. Do not imply the people in the article
are members or that Techno Optimists installed the boxes.

Select five non-team contacts with a real interest in the subject. Keep names,
contact details and their replies in Roy's private notes, outside this public
repo. If there are fewer than five suitable contacts, use the smaller batch;
do not fill it with unrelated recipients.

## Invitation copy

> I'm building Techno Optimists, a place to find real-world problems and help figure them out.
>
> This thread is about making room for sparrows in cities. What would you want to know before trying something like this in your neighborhood?
>
> https://technooptimists.org/c/scout-51c0cb67ac3c0ef2b9c1d3fe
>
> Have a look when you have a minute. You can just reply here: what caught your interest, what was missing, or what broke? No need to sign up to give me feedback.

For someone who replies, ask only the unanswered question that matters most.
If they tried contributing, ask where they got stuck. If they only browsed, ask
what would make them come back. Respond to every reply before inviting another
batch; do not automatically chase people who stay silent.

## Before sending

1. Roy approves the recipients and message in his chosen direct-message channel.
2. Open the exact thread on a phone and desktop. Confirm its story, source link
   and contribution controls are visible. If browsing fails, pause invitations
   and fix that failure first. Check sign-in and contribution in the isolated
   test environment before making claims about that journey.
3. Record the send date and the preceding seven complete UTC days. Run the
   existing visitors, thread-opens, signups and contributors reports through the
   authenticated reporting runner. Keep unavailable values as unknown.

## Record and review

Use one private row per invitee, identified as R1 through R5. Record: sent date,
confirmed read (yes/no/unknown), action attempted, action completed if verified,
feedback in their words, missing/broken/wanted, and Roy's response. A sent
message is not a visit; silence is not a confirmed failure to read.

Review after seven complete UTC days following the send day. Report invited, confirmed readers,
people who replied, and verified contributors separately. Include every known
reader in the feedback review, including those whose feedback is still missing.
Repeat the existing reports for the seven full UTC days after the send day and
compare with the recorded baseline. These site-wide totals are context: the
current reports do not attribute visitors or sign-ups to this invitation.

Continue with another small batch only if a reader identifies something useful
and there is no unresolved journey failure. If readers cannot explain the value,
use their words to revise the invitation or thread choice. If they hit a bug,
fix it first. If nobody confirms reading, revisit recipient fit and the invitation;
do not conclude that the product failed or build another feature from silence.

## Evidence and remaining checks

Checked on 2026-10-19: the public feed and detail API return this thread with
`@atlas` provenance, zero typed actions, zero updates and zero listed people.
The original article contains the nest-box story. The thread URL returns HTTP
200, but its initial HTML has a generic title and relies on client loading for
this story; HTTP alone does not establish a working reader journey.

Rechecked on 2026-10-20 using MightyMouse's built-in Browser tab
(`browser_open`, then `browser_read`). The generic initial HTML resolves to the
specific sparrow thread title after client loading. The browser readback shows
the cover, story, `@atlas` attribution, original-article link, four typed action
controls, discussion and progress sections. Clicking **Write a response** opens
the composer with a response field, contribution labels and **Sign in to respond**.
The composer was closed without entering or publishing content. This verifies
loading and the composer entry point, not successful sign-in or contribution.

The Codex `iab` entry point still returned `Browser is not available: iab`;
MightyMouse's Browser tab is a working alternative for this check. Phone layout,
visual layout inspection and the isolated sign-in/contribution test remain
outstanding. No UI was changed. Opening the live thread recorded one test view
(the public API showed zero before the browser visit, and the browser showed one
afterward); do not count this as a recruited reader or growth.

PR #15's Feedback link remains absent from the live homepage and the selected
thread's navigation. The visitors, signups and thread-opens commands returned
`CLOUDFLARE_API_TOKEN is not set`, so the effects of PRs #15 and #16 remain
unverified. The local main checkout predates #16; `origin/main` contains the
complete-UTC-day fix. Run the baseline from that revision through the authenticated
reporting runner. There is no measured regression to justify a revert.

Direct replies make this experiment independent of the pending Feedback
deployment. Recipient/message approval and the remaining checks above still
precede invitations. No outreach, production deployment or private contact data
is included in this change. The supplied 42 visits and 0 sign-ups remain the
baseline, not a verified result of this QA run.

Follow-up on 2026-10-20: the isolated `test:community:local` check now passes
local sign-in, import, comments, replies, duplicate retries, stage isolation,
editorial permissions and post-build routing in both editions. Its old assertion
expected the Classic component on the newspaper route. The corrected check
requires each edition's own hydration component, a loadable JavaScript bundle,
and 404s for unknown threads.

Built-in browser readback then exposed a separate reader-facing failure:
Classic `/v1/c/<slug>` requested `/api/challenges/c` and showed an error instead
of the thread. Normalizing the edition prefix before extracting the slug fixes
this. Two regression cases failed on the old code; all three pass with the fix.
After rebuilding, a thread created after the build loaded its actual title,
story, response field and contribution controls in Classic. The newspaper
fallback also loaded in the built-in browser. These are local API and browser
readback checks, not phone-layout approval or a browser-published contribution.

This follow-up targets activation (use is still unmeasured) and the supplied
**34 visits / 0 sign-ups** snapshot. The visitors and signups reports still
exit with `CLOUDFLARE_API_TOKEN is not set`; the older 42-visit snapshot is not
an attributable before/after comparison. No measured regression supports a
revert. Phone/layout QA, browser sign-in through publishing, approved recipients,
and production deployment remain separate gates; no invitations were sent.


Follow-up on 2026-10-21: **local browser sign-in through response publishing is
verified** on `aa984ca` in an isolated worktree. This removes one pre-invitation
check aimed at activation (use remains unmeasured) and the supplied **34 visits /
0 sign-ups** funnel. It does not claim a new user or a change in conversion.

Reproduce with checkout-local Wrangler configs using dummy resource IDs, local
bindings only, `ENVIRONMENT=dev`, and the fixture admin
`qa-admin@example.test`. Run `npm ci`, `npm run db:local`,
`npm run db:migrate:local`, `npm run db:seed:local`, `npm run build:web`,
`npm run dev -- --local --port 8795`, then `npm run test:community:local`.
Seed setup is required: the first attempt without it returned `unknown_author`
for `atlas`; after seeding, the existing API check passed. Never use this reset
or fixture workflow on a remote database.

In MightyMouse's built-in Browser tab, opened `/signin`, entered the new local
fixture `factory-reader@example.test`, requested its link, and clicked **Local
link - no mail key set**. The click tool reported failure during navigation,
but the following authenticated publish and its `@factoryreader` author confirm
the session succeeded. Opened `/c/tokyo-cut-its-crows-under-fifth`, chose **Write
a response**, entered a local QA question about comparing covered collection
bins, and clicked **Publish response**. The UI displayed **Your response is
published.** Reopening the thread preserved the response under `@factoryreader`.
An independent GET of the comments API found exactly one matching response;
the thread remained at `learn` with zero progress updates.

A native screenshot of the built-in browser confirmed the composer, input,
label selector and publish control were visible in its desktop side panel.
This is not phone-size or full-page visual approval. The local magic link tests
session creation and publishing, not production email delivery. All 336 tests,
API and web TypeScript checks, the local build and community smoke check passed.

The live homepage still has no Feedback link. Both reporting commands again
returned `CLOUDFLARE_API_TOKEN is not set`; no measured regression or attributable
growth is established, so no revert is justified. Keep the stage **prelaunch**.
Phone/layout QA, production deployment and verification, and approved recipients
remain before invitations. No production data, email, invitations or deployment
were created by this check.
