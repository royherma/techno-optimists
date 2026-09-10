/**
 * Short confirmations and failures, shown at the edge of the sheet.
 *
 * Why this exists: most of what the site does happens without a page change -
 * an action is recorded, a photo fails to upload, a session ends. Before this,
 * a failed action silently rolled its own count back and said nothing, which
 * reads as the click never having landed.
 *
 * One bus, not a React context: the callers are separate islands
 * (SessionNav, ActionBar, CaptureForm) that never share a tree, so a provider
 * could not reach them all. A module-level emitter can.
 */

export type SnackTone = 'done' | 'problem'

export type Snack = {
  id: number
  text: string
  tone: SnackTone
}

type Listener = (snacks: Snack[]) => void

const listeners = new Set<Listener>()
let snacks: Snack[] = []
let nextId = 1

/** How long a snack stays up. A failure lingers - it asks for a decision. */
const LIFETIME: Record<SnackTone, number> = {
  done: 4000,
  problem: 7000,
}

const publish = () => {
  for (const l of listeners) l(snacks)
}

export const subscribe = (l: Listener) => {
  listeners.add(l)
  l(snacks)
  return () => { listeners.delete(l) }
}

export const dismiss = (id: number) => {
  snacks = snacks.filter((s) => s.id !== id)
  publish()
}

/**
 * Shows a message. Returns its id so a caller can retract one early.
 *
 * Identical consecutive messages collapse: a reader who clicks a failing
 * action three times wants one "that did not save", not a stack of three.
 */
export const snack = (text: string, tone: SnackTone = 'done') => {
  const last = snacks[snacks.length - 1]
  if (last && last.text === text && last.tone === tone) return last.id

  const id = nextId++
  snacks = [...snacks, { id, text, tone }]
  publish()

  // No timer on the server: this module is imported by islands that Astro also
  // renders at build time, where setTimeout would keep the build process alive.
  if (typeof window !== 'undefined') {
    window.setTimeout(() => dismiss(id), LIFETIME[tone])
  }
  return id
}

/* -------------------------------------------------------------------------- */
/* The one-shot cookie the API leaves behind                                  */
/* -------------------------------------------------------------------------- */

const SIGNAL_COOKIE = 'to_signal'

/**
 * What each signal says. The API only ever sets a name; the words live here,
 * because copy belongs on the client and a cookie value in a Set-Cookie header
 * is not the place to keep a sentence.
 */
const SIGNAL_TEXT: Record<string, { text: string; tone: SnackTone }> = {
  signed_in: { text: "You're signed in.", tone: 'done' },
  signed_out: { text: "You're signed out.", tone: 'done' },
}

const readCookie = (name: string): string | null => {
  for (const part of document.cookie.split(';')) {
    const [k, ...rest] = part.trim().split('=')
    if (k === name) return rest.join('=') || null
  }
  return null
}

/**
 * Reads the signal the API left on the last redirect, shows it, and erases it.
 *
 * Erasing matters: without it, every page load for the next 30 seconds would
 * announce the sign-in again.
 */
export const drainSignal = () => {
  const signal = readCookie(SIGNAL_COOKIE)
  if (!signal) return
  document.cookie = `${SIGNAL_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`
  const known = SIGNAL_TEXT[signal]
  if (known) snack(known.text, known.tone)
}
