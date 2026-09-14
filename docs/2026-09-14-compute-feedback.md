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
