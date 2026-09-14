# Prize threads

Plan, 2026-09-14. Decided with Roy: ingest **external** prizes only, badge on the
card, no separate section and no feed boost. No money moves through this site.

## Goals check - read this before building

Roy asked whether this is actually good for the product. Checked against
`PRODUCT.md` and `docs/2026-09-10-concept.md`. Two parts of the first draft failed
and are corrected below. The feature survives; the first source does not.

**PRODUCT.md:98 puts this behind a decision that has not been made:**

> Business model directions exist in the concept (bounties, sponsored threads,
> talent, tools/components, R&D network) but none is committed and **none may
> appear in UI**.

A prize chip is money appearing in the UI, so this plan did not get to decide it
quietly. **Asked and answered: Roy confirmed 2026-09-14 that citing someone else's
prize is outside that restriction** - it is a sourced fact, not a business model,
because we never hold or take money. See "Decided" at the end.

**Government sources: kept as a category, but Grants.gov specifically does not
carry prizes.** Roy pushed back on cutting it - a working API should not be thrown
away, and government prize programs are a good fit. He is right on the principle,
and I was wrong to cut on a sample. So I re-tested with filters instead.

Grants.gov exposes an eligibility filter I had missed, including `21 Individuals`
(14 open) and `99 Unrestricted` (177 open), which fixes my "nobody here is
eligible" objection. But the decisive fact is its funding-instrument taxonomy:

```
CA | Cooperative Agreement | 292
G  | Grant                 | 743
O  | Other                 | 46
PC | Procurement Contract  | 26
```

There is no prize or competition instrument, because prizes are not administered
through Grants.gov at all. Searching it for `prize` returns **2 hits**, both
unrelated ("Department of Defense HIV/AIDS Prevention Program"). Filtered to
individuals, the open rows are still research programs - NOAA Broad Agency
Announcements, "LPS Qubit Collaboratory", "Partners for Fish and Wildlife".

So this is not a taste judgment any more, it is a category error: Grants.gov is a
grant-application system and a grant is not a prize. Roy's WaterSMART example is
the clearest case - it is a real Bureau of Reclamation program, and it funds water
districts to do projects. You apply as an organization with a proposal and a
budget; you do not win it by solving something.

**Federal prizes live somewhere else, and that somewhere has no API.**
`challenge.gov` 404s on every API and feed path tried. It now redirects people to
`usa.gov/find-active-challenge`, which does list active federal competitions
("Ready, Set, ID Biothreat") - but as hand-written landing pages with no prize
amount, no deadline, no feed and no API.

**Conclusion: government prizes stay on the target list; Grants.gov is the wrong
door to them.** It is not dropped for being governmental, it is dropped for not
containing prizes. If a machine-readable federal prize source appears - or if
scraping the ~20 usa.gov challenge pages proves worthwhile - government sources go
straight in.

**What the feature should be instead.** The prize is not the point; the *problem
the prize proves is worth solving* is the point. A thread earns its place on the
feed by being an interesting problem. The prize is a fact appended to it, the same
shape as `source_url`: evidence that someone serious thinks this is hard and worth
money. That keeps the object a thread and not a listing.

So the rule is: **a prize never creates a thread on its own.** It attaches to a
thread that would have been worth posting anyway. This one rule keeps the feed from
drifting into a jobs board, and it removes the need for the separate writer prompt
and the relaxed gate that the first draft invented.

## Schema

Additive to `challenges`, same pattern as `impact` - an `ALTER` in `schema.sql`
plus a guarded `ALTER` in `scripts/migrate-community.mjs`. Prod D1 needs the manual
ALTER noted in `docs/CONSTRAINTS.md`; add this one to that list in the same commit.

```sql
-- Externally funded reward attached to this thread. All NULL is the normal case.
-- We are never the payer and never hold funds; prize_url is the sponsor's own
-- entry page and is the only place a person can actually enter.
ALTER TABLE challenges ADD COLUMN prize_amount   INTEGER;  -- minor units, e.g. cents
ALTER TABLE challenges ADD COLUMN prize_currency TEXT;     -- ISO 4217, 'USD'
ALTER TABLE challenges ADD COLUMN prize_sponsor  TEXT;     -- 'XPRIZE Foundation'
ALTER TABLE challenges ADD COLUMN prize_url      TEXT;     -- official entry page
ALTER TABLE challenges ADD COLUMN prize_deadline TEXT;     -- ISO date, NULL = rolling
ALTER TABLE challenges ADD COLUMN prize_note     TEXT;     -- 'pool split across 5 finalists'
```

Six columns, not a `prizes` table. One thread carries at most one headline prize;
a multi-tier purse is a total plus a `prize_note`. A join table would be an extra
query on the hottest path in the site for a field that is NULL on most rows.

`prize_amount` is minor units as an integer. Never a float - money in a REAL column
is how a $10,000,000 purse renders as $9,999,999.99.

Index is partial so the common NULL row costs nothing:

```sql
CREATE INDEX idx_challenges_prize ON challenges(prize_deadline)
  WHERE prize_amount IS NOT NULL;
```

Types: add the optional `prize` block to the `Challenge` type in `packages/types`,
and deliberately keep it OUT of any card type that is not already reading the full
row - the feed query selects it, nothing else changes shape.

## Expiry is the whole problem

A prize page that advertises a deadline that passed three months ago is worse than
no prize page. This is the only real maintenance cost of the feature, so it is
handled in the read path, not by a cleanup job that can silently stop running:

- The API computes `prize_status` at query time from `prize_deadline` vs now:
  `open` | `closing_soon` (<= 14 days) | `closed` | `rolling` (NULL deadline).
- A `closed` prize renders as past tense on the card - "Prize closed 12 Aug" - and
  the entry link is dropped. The thread stays; the problem did not go away when the
  competition did.
- Nothing is deleted. The row is history and it is also what tells us the sponsor
  runs a cycle worth checking again next year.

## Ingestion - no admin step

Roy's call: prizes flow through the unattended Scout path, no hand entry. The
constraint from the goals check above shapes how: a prize source **enriches an
existing thread**, it does not create one.

Two stages, both unattended:

1. **Scout keeps finding problems from the eight news feeds, unchanged.** No new
   writer prompt, no relaxed gate, no second audit. The `evidenceGate` stays exactly
   as tuned.
2. **A matching pass attaches a prize to a thread that already exists.** It pulls
   open competitions, compares each against existing threads, and sets the six
   columns when one clearly matches the same physical problem.

Stage 2 is where the `problem_key` field already in `draftSchema`
(`scout-cloudflare.ts:22`, "describes the recurring physical problem, not a
headline") earns its place - it exists precisely to group threads by physical
problem, which is the join a prize needs. Matching is model-judged against the
thread's own text, with the same audit discipline: no match, no prize, and a
mismatch is a silent skip rather than a guess.

This removes the entire `prizeGate` / `PRIZE_WRITER` design from the first draft.
Nothing new has to pass an evidence gate, because no new thread is created.

### Source feasibility - tested 2026-09-14, not assumed

Every candidate below was hit with curl this session. Most prize sites publish
nothing machine-readable at all.

**Correction, 2026-09-14, during implementation.** The table below was built by
guessing feed paths (`/feed`, `/rss`) and concluding from their 404s that the
source was unreachable. Re-testing the sources themselves rather than their
hypothetical feeds disproved two rows:

- **HeroX is the best source available and is now wired** (`prize-herox.ts`).
  The listing page's own bootstrap JSON names its data source in `view.api_url`:
  `GET https://www.herox.com/async/api-internals/public/challenge/search` returns
  HTTP 200 and `{"count": 679, ...}` with no key, no auth and no WAF. It carries
  competitions run by NASA, NIH, the DOE and XPRIZE itself.
- **XPRIZE answers `POST /graphql`** with `prizes { items { name prizePurse
  primarySponsor prizeRegistration { endDate isOpenForRegistration } } }`. Real,
  but only **1 of 36** tracks was open for registration, so no adapter yet.
- **Challenge.gov was not blocked, it is dead** - sunset 2026-03-30.
- **DARPA** `/json/opportunity.json` is 156 procurement notices, zero prizes.

The lesson worth keeping: a 404 on a guessed path is evidence about the path,
never about the source.

| Candidate | Result |
|---|---|
| `xprize.org/feed`, `/rss`, `/news/feed`, `/competitions/feed` | 301 to a competition page, then 404. No *feed* - but see the correction below: `POST /graphql` works. |
| `herox.com/blog/feed`, `/rss`, `/crowdsourcing-news/feed` | 404. **The "AWS WAF" conclusion was wrong** - see the correction below. Only blog RSS paths were tried; the site's own API was never looked for. |
| `challenge.gov` `/rss`, `/feed`, `/challenges.xml`, `/api/challenges*` | All 404 - but not for the reason assumed. The platform was **sunset on 2026-03-30**; the homepage says so and `api.challenge.gov` no longer resolves. |
| `innocentive.com/feed/` | 302 to the homepage, `text/html`, zero items. Feed retired. |
| `grandchallenges.org`, `gcgh.grandchallenges.org` feeds | 404. |
| `grantsgovprod.wordpress.com/feed/` | Valid RSS2 - but site-admin news ("Grants.gov is retiring its Mobile App"), not opportunities. |
| `api.simpler.grants.gov` | HTTP 401, needs a key. |
| `api.grants.gov` search2 + fetchOpportunity | **Works, no key** - `hitCount: 141`, `awardCeiling = 7800000`, `responseDate = Oct 15, 2026`. **Dropped anyway: wrong content.** See the goals check. |
| EU SEDIA `api.tech.ec.europa.eu` | **Works, no key** - `totalResults: 18476`, carries `deadlineDate` + `budgetOverview`. Needs a multipart `query` file field; a plain query parameter returns HTTP 500. Status filter still unsolved (see below). |

**The SEDIA status mapping below was wrong; corrected 2026-09-14 during
implementation.** The codes were inferred from future-deadline ratios rather than
read from the response. `actions[].status.description` names them outright:

```
31094501 -> "Forthcoming"  total  6,856
31094502 -> "Open"         total 14,242
31094503 -> "Closed"       total 244,911
```

So `31094502` is Open, not Closed. Treating it as closed would have discarded the
larger half of the live set. `apps/api/src/prize-sources.ts` therefore uses
`SEDIA_LIVE_STATUSES = ['31094501', '31094502']` - forthcoming and open both
matter, because a prize you can see coming is still worth attaching.

**`text=prize` returning 0 was also wrong.** Live it returns **4,027 hits**, all
genuine EU prizes (SOFT Innovation Prize, Horizon Prize for Social Innovation,
Nuclear Innovation Prize) - every one of them status `31094503` (Closed). The
adapter is correct and returns nothing today only because no EU prize is
currently open, which is a fact about the world, not a bug. Matching still runs
client-side on `actions[].description` (`/\bprize\b/i`, matching the real value
`"IPr Inducement Prize"`).

**But the same category error appears here too.** Of those 100 open EU calls, the
number with "prize" in the title is **zero**. What they actually are:

```
2027-09-23 | Impact of access to nature-positive environments in promoting social c
2027-12-01 | Industrial processes and equipment for innovative, reliable and scalab
2027-11-04 | Enhancing preparedness for large-scale cross-border disasters
```

Horizon Europe research calls - consortium grants for institutions, with the same
mismatch as Grants.gov. The EU does run real prizes, and the archive proves the
data model holds them ("CASSINI Prize for digital space applications", "Horizon
impact award", both closed). They are just rare enough that none is open today.

**Honest state after testing eleven sources: two APIs work perfectly and neither
currently returns a prize.** Every large machine-readable funding API is a *grants*
API, and every real prize aggregator (XPRIZE, HeroX, Challenge.gov, Longitude,
Nesta, MIT Solve, Grand Challenges, Hello Tomorrow, Prototypes for Humanity) either
404s, has no feed, or sits behind a WAF. That is the finding, and it is worth more
than a half-built pipeline pointed at the wrong content.

What this means for the build: the SEDIA adapter is worth writing **because the
filter now works** - it just needs the client-side prize match, and it will find
CASSINI-class calls when they open. It should not be judged by an empty result on
one day. Stages 1-4 are unaffected either way.

Candidates still worth testing for stage 2, none verified yet: Horizon/EIC prizes
via a corrected SEDIA filter, Longitude Prize, Nesta challenge prizes, MIT Solve,
Gates Grand Challenges RFPs, Hello Tomorrow, Prototypes for Humanity. Each needs
the same curl treatment before it goes in a table as real.

## Feed surface

The tile is already dense - type, stage, location, date, three typed-action counts,
views, and a read link (`StoryTile.tsx:14`). A money chip competes with the typed
actions, which PRODUCT.md says carry meaning the product depends on. So the prize
gets *less* prominence than the first draft gave it:

- **Feed tile**: one short line in the existing `np-story-meta` row - `$15M prize ·
  closes 12 Mar`. Same weight as location and date. No accent color, no badge
  styling, nothing that outranks the thread type or the action counts. If it reads
  as louder than "I have this problem", it is wrong.
- **Thread page** (`ChallengePage.tsx`): the full block - sponsor, amount, deadline,
  status, entry link with `rel="noopener"`. This is where someone who is interested
  goes, and where the fact can be stated properly.
- No sort change, no section, no filter in v1.

Copy on the thread page, one line, plain, stated once because it is a fact the
reader acts on:

> Run by {sponsor}. Enter on their site - Techno Optimists is not involved in
> judging or payment.

That sentence ships as product copy: it is a legal relationship the user needs, not
a status report about what we have built. Per `CLAUDE.md` copy rules, nothing about
prizes being new, partial or experimental appears anywhere on the page.

Both files are currently modified in the working tree. Re-read them immediately
before editing.

## Why this is worth doing

A prize is third-party evidence that a problem is hard and worth solving. That is
an editorial signal the feed genuinely lacks, and it is the same *kind* of fact as
`source_url` - something true about the problem, sourced from outside. It gives a
capable builder a reason beyond goodwill without making money the organizing
principle of the page.

The risk it must not become: the feed turning into a listings board where the
interesting problems with no money attached start looking second-class. The
enrichment-not-creation rule and the deliberately quiet tile treatment are both
there to hold that line. Worth re-checking after the first twenty prize threads
exist - if the unfunded threads start feeling like filler, this was a mistake and
should come back out.

## Order of work

Stages 1-4 are independent of which source wins, and are safe to build now:

1. Schema ALTERs + `migrate-community.mjs` guard + `CONSTRAINTS.md` entry.
2. `packages/types` optional prize block; API selects the columns and derives
   `prize_status`.
3. The enrichment pass: match an open competition to an existing thread by
   `problem_key` and thread text, set the six columns, skip silently on no match.
4. `StoryTile` meta line, `ChallengePage` block and the one-line copy.

5. **SEDIA adapter** filtering on forthcoming + open (`31094501`, `31094502`)
   plus a client-side prize match, so a CASSINI-class call is picked up the day
   it opens.
6. Re-test the no-API prize aggregators periodically; add a government source the
   moment a machine-readable federal prize feed exists.

## From the user's side

Roy asked to see this from the user perspective. Each answer is a design
constraint, not reassurance - if the built thing answers differently, it is wrong.

**"Is this a job board now?"**
No. A prize never creates a thread. Every thread on the feed is there because the
problem was worth posting; the prize is one more fact about it, sitting at the same
weight as the location. Remove every prize tomorrow and the feed is unchanged.

**"I can't win this - a US agency grant isn't for me in Bangkok."**
Right, and that is exactly why Grants.gov was cut. If the reward is not reachable
by a capable person anywhere with an internet connection, it does not go on the
feed. Open competitions only.

**"Does the money decide what I see first?"**
No. No boost, no sort change, no prize section. Funded and unfunded threads rank
identically.

**"I spent a weekend on this. Do I get paid?"**
Not by us, and the page says so in one line at the point you would act on it. We
are not a party to the competition - the entry link goes to the sponsor and the
judging is entirely theirs.

**"This prize closed in March. Why is it still here?"**
The status is computed at read time, so a closed prize reads as closed and the
entry link disappears. The thread stays, because the problem did not end when the
competition did.

**"Who decided this problem is worth $15M?"**
The sponsor, and they are named. That is the entire value of the signal: it is
third-party evidence, and it is worthless if the reader cannot see whose evidence
it is.

## Decided

**Money in the UI (PRODUCT.md:98) - resolved by Roy, 2026-09-14.** Citing a
third-party prize is outside the business-model restriction: it is a sourced fact
about the problem, the same shape as crediting a newspaper via `source_url`. It
commits no business model because we never hold, take or broker money. The prize
may render on the feed and thread page. A bounty we hold would be a different
decision and is not in scope.
