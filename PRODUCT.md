# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Astro + Cloudflare Worker + D1. Confirmed by the user 2026-09-10, resolving the "stack deferred"
row in `docs/2026-09-11-decisions-archive.md`. Matches `creators-of-today` and `She-Kee` in the
sibling folder, and
the Cloudflare account key already present in `.env.example`. Node pinned to 22 in `.nvmrc`.

## Users

**Primary: the curious browser.** Someone who opens the feed to encounter interesting real-world
problems, with no intent to contribute yet. Their success is enjoying the browse and thinking
"wait... I wonder if you could...". Contribution is allowed to emerge later, never demanded.

Two further audiences exist in the concept and will use the same objects, but the first surface is
not optimized for them:

- **The capable builder** — engineer/maker scanning for a problem worth their skills.
- **The person with the problem** — farmer, resident, fisherman, posting their own Challenge,
  possibly in another language and in unstructured form.

Nobody needs to be an engineer to matter. The person experiencing the problem can be the most
valuable participant because they can repeatedly test whether a solution works.

## Product Purpose

A global community where people surface real-world challenges and technological ideas, then work
together to investigate, build, test and improve solutions. Technology is the tool, not the topic.

The product promise is "find interesting real-world problems and help solve them." Techno Optimists
is the identity of the people who do that, not the pitch.

Success for the first surface is that browsing is enjoyable on its own. The concept is explicit
that browsing must work before contribution is asked for.

## Positioning

Distributed applied R&D for everyday people. The intersection is real problems + global people +
technology + AI + experimentation + public progress.

Neighboring products each hold one piece and not the combination:

- **Hackaday.io** — collaboration around projects people already decided to build.
- **Zooniverse** — mass distributed participation, but tasks are predefined by researchers.
- **FixMyStreet** — ordinary people surface local real-world problems, but the mechanism is
  reporting to whoever is responsible, not crowdsourcing a technological solution.

The long-term asset is not posts, it is the accumulated graph of
people ↔ skills ↔ problems ↔ ideas ↔ experiments ↔ solutions.

## Operating Context

The MVP scope named in the concept doc:

- **Home** — visual feed of Challenges, photos and video first.
- **Create** — three choices: share a problem, share an idea, share something you're building.
  AI helps structure the post.
- **Challenge page** — media, problem/context, location if relevant, ideas, people helping,
  experiments, updates. A living page, not a disposable social post.
- **One contribution button** — "Help solve this", then "How can you help?" (research, code,
  hardware, design, expertise, testing, funding, other).
- **Progress log** — every meaningful development appends to the Challenge timeline.

Explicitly out of scope for the first build: GitHub + Reddit + Kickstarter + Discord in one.

## Capabilities and Constraints

**Vocabulary is binding** (from `CLAUDE.md`, use these exact words):

- **Challenge** — the core object. Not "post", not "project", not "issue".
- A Challenge starts as one of: **Problem**, **Idea**, **Experiment**, **Build**.
- Lifecycle: Spot → Understand → Ideas → Build → Test → Learn → Improve.
- People roles: **Scout**, **Thinker**, **Researcher**, **Builder**, **Expert**, **Tester**.
- Social actions are typed, never a generic Like: I have this problem / I want this / I have an
  idea / I can help / I'll test this / I'm building this / Follow progress.

Typed actions carry meaning the product depends on: 4,700 people clicking "I have this problem" and
34 electrical engineers clicking "I can help" are different, useful facts. A generic Like destroys
that.

**AI is invisible plumbing.** Transcribe, translate, identify the core problem, extract constraints,
generate a clean Challenge page, find similar problems, suggest questions, surface relevant
research, identify contributors. On an active Challenge it maintains: what we know / what we've
tried / open questions / current best hypothesis / next experiment. Never presented as an "AI
community".

**Undecided, do not invent:** auth model, moderation, media pipeline and hosting, geo/location
handling, i18n scope beyond "input may be any language", notification model, the D1 schema.
Business model directions exist in the concept (bounties, sponsored Challenges, talent,
tools/components, R&D network) but none is committed and none may appear in UI.

## Brand Commitments

- Name: **Techno Optimists**.
- Statement of philosophy: "Things can be better. We can build better."
- Product promise: "Find interesting real-world problems and help solve them."
- Emotional line: "See something that could be better? Help make it better."
- Distinctive line: "Local problems. Global brains. Technology to build the solution."
- Copy rules (`CLAUDE.md`): plain words, hyphen not em-dash. Never ship "this is a prototype" or
  "not built yet" into user-facing copy.

**Deliberately avoid** — these are identity constraints, not preferences:

- Not startup-focused. A successful outcome does not need to become a company.
- Not future-focused. Fixing an irrigation system this afternoon counts equally.
- Not charity-focused. Social impact happens naturally without defining the culture.
- Solutions are not required. Documenting a fascinating problem is a complete contribution.
- Expertise is not required.
- Not generic social media. Everything connects back to understanding, creating, testing or
  improving something.

## Evidence on Hand

**None.** There are no real Challenges, users, photos, videos, metrics, testimonials or partners.
Confirmed by the user 2026-09-10.

The first build uses clearly fictional placeholder Challenges. The concept doc's five examples
(milk cooling, drone compute, mosquitoes, hot bedroom, fishermen) are illustrative sketches, not
real submissions, and media for them does not exist and must be sourced or generated.

Future work must not fabricate participant counts, solved-challenge counts, locations, named
people, organizations, press or funding.

## Product Principles

1. **The feed comes before collaboration.** Browsing must be enjoyable before contributing is
   asked. If the first viewport is not interesting, nothing downstream matters.
2. **Engagement must mean something.** Every social action is typed and produces a fact about who
   has the problem, who wants it, and who can help.
3. **A Challenge is a living page, not a post.** It accumulates knowledge and progress over time
   instead of scrolling away.
4. **AI is plumbing, never the subject.** It removes coordination cost between strangers and stays
   invisible in the interface.
5. **The problem-holder is a first-class participant.** Proximity to the problem is as valuable as
   engineering skill.

## Accessibility & Inclusion

No project-specific standard has been set. Two product facts already constrain design: input may
arrive as video or speech in any language and gets transcribed and translated, and participants
range from engineers to people with no technical background. Neither the interface nor the copy may
assume expertise.
