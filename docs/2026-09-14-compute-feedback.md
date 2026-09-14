# Contribute compute - Roy's feedback, 2026-09-14 18:36

Captured verbatim from the live walkthrough on
`technooptimists.org/c/pond-s-oxygen-crashes-at-dawn` so it is not lost.

## What he said

- "can't you get it to provide for [the app name] so it'll auto-name it
  technooptimists.org maybe" - the OpenRouter authorize page shows
  **"An app requests access to your account"** and a **Key label** of
  **"An app"**. It should say TechnoOptimists.org.
- "it did come back to us" - the OAuth round-trip works. Landed on
  `/c/pond-s-oxygen-crashes-at-dawn?connected=1`.
- "I tap on it, put your AI credits, run a frontier model on this thread...
  but then it's not really clear what it does. Run this on my credits.
  Working on it. Yeah, I don't know, it feels like it's not so clear."
- "okay I did run this on my credits and now it's... yeah, maybe it should
  open like a box of the response, of the idea. And do it now. We just kind
  of did that and it's not clear."

## The items

1. **App identity on the OpenRouter consent screen.** Name the app so the
   authorize page and the minted key read `TechnoOptimists.org`, not "An app".
2. **Connecting from a thread does not tell the thread.** He came back to
   `/c/...?connected=1` and the page said nothing. The FAB was closed, the
   `connected=1` param was ignored by `ContributeCompute`, and the page showed
   a blank body in the screenshot. Connect should return him to the thread with
   the panel OPEN and the run ready.
3. **"Run this on my credits" does not say what it produces.** The lede
   describes it, the button does not. He read the button and the "Working on
   it..." state and could not tell what was happening or what he would get.
4. **The result is not presented.** After a run the output must land somewhere
   visible - "a box of the response, of the idea" - not appended to a list
   inside a collapsed floating panel that he has to scroll.

## Round two - the redesign, from the second walkthrough

Roy, after using the round-one build: the flow should not be a panel beside the
thread at all. It should be the "Write a response" composer.

> it should open like the this this kind of thing right the writer response with
> it and then it's like contribute complete enable it just should allow them to
> then it'll help create it'll show it'll help come up with an idea an
> explanation on a solution so basically take all the information it'll say how
> much it costs i need to save all that as well and allow you to yeah save it as
> an answer uh and edit it but we'll always save the original response

Three decisions he pinned:

1. **Attribution** - the response is the person's, carrying a small
   "drafted with AI on my own credits" mark, with the model's original viewable
   behind it.
2. **Draft type** - the model decides whether the thread needs an idea, an
   explanation, a solution or a question, and returns that choice through a JSON
   schema rather than the person picking up front.
3. **Cost** - shown only to the donor now, and stored, so
   "how much compute was contributed to solve it" can be published later.

### What shipped for it

- `draft` action and `parseDraft()` in `apps/api/src/ai-accounts.ts`.
- `ai_runs.draft_kind` and `ai_runs.published_comment_id`; `output` stays the
  untouched original and is never rewritten.
- `POST /api/ai/runs/:id/published` links a run to the response it became,
  scoped to the caller's own run and own comment.
- `GET /api/comments/:id/original` serves the model's original behind the mark.
- `DraftWithCompute.tsx` inside the composer; `AssistedMark.tsx` under a
  published response. The floating panel (`ContributeCompute.tsx`) is deleted.
