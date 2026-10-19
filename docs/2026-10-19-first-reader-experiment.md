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
