import { useEffect, useState } from 'react'

/**
 * Sign-in is one field. No password to choose, no confirmation step, no
 * account to "create" - the link in the mail does all of it.
 */
/** Where the reader was headed before we asked them to sign in. */
const nextPath = () => new URLSearchParams(window.location.search).get('next') ?? undefined

// /api/auth/callback sends the reader back here with a reason. They all end in
// the same action - ask for a new link - but naming the right one matters: a
// reader who requested a link twice and clicked the older mail is not looking
// at an expired link, and being told so reads as the product being wrong.
//
// This lives in the island, not in signin.astro. The page is prerendered
// (astro.config.mjs `output: 'static'`), so Astro.url.searchParams is empty at
// build time and a server-rendered block is dropped from the HTML entirely.
const REASON: Record<string, string> = {
  expired: 'That link has expired. Links last 15 minutes - ask for a new one.',
  used: 'That link has already been used. Ask for a new one.',
  unknown: 'That link is no longer valid. Ask for a new one.',
  missing: 'That link was incomplete. Ask for a new one.',
}

/** The copy for ?error=, or null when the reader arrived here on their own. */
export const reasonFor = (search: string): string | null => {
  const error = new URLSearchParams(search).get('error')
  return error ? (REASON[error] ?? REASON.unknown) : null
}

export default function SignInForm() {
  const [email, setEmail] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [devLink, setDevLink] = useState<string | null>(null)
  // Read once on mount: the query string cannot change under a mounted island,
  // and asking for a new link answers the old reason, so sending clears it.
  const [reason, setReason] = useState<string | null>(null)
  useEffect(() => setReason(reasonFor(window.location.search)), [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || state === 'sending') return
    setState('sending')
    try {
      const r = await fetch('/api/auth/request', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ email: email.trim(), next: nextPath() }),
      })
      if (!r.ok) throw new Error(String(r.status))
      const data = await r.json()
      // Only ever present when the server has no mail key, i.e. local dev.
      setDevLink(data.dev_link ?? null)
      setState('sent')
    } catch {
      setState('error')
    }
  }

  if (state === 'sent') {
    return (
      <div className="space-y-3">
        <p className="font-[family-name:var(--font-display)] text-2xl text-(--color-ink)">Check your mail</p>
        <p className="text-sm text-(--color-ink-soft)">
          A sign-in link is on its way to <span className="text-(--color-ink)">{email}</span>.
          It works once and expires in 15 minutes.
        </p>
        {devLink && (
          <a
            href={devLink}
            className="mt-2 inline-block border-b border-(--color-grid-ink) font-[family-name:var(--font-mono)] text-xs text-(--color-grid-ink)"
          >
            Local link - no mail key set
          </a>
        )}
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {reason && (
        <p className="mb-6 border-l-2 border-(--color-problem) bg-(--color-paper-sunk) px-3 py-2 text-sm text-(--color-ink-soft)">
          {reason}
        </p>
      )}

      <label className="block">
        <span className="font-[family-name:var(--font-mono)] text-[11px] tracking-[0.14em] text-(--color-ink-faint) uppercase">
          Email
        </span>
        <input
          type="email"
          required
          autoFocus
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="mt-2 w-full border-b border-(--color-rule-soft) bg-transparent pb-2 text-lg text-(--color-ink) outline-none focus:border-(--color-rule)"
        />
      </label>

      <button
        type="submit"
        disabled={state === 'sending'}
        className="feedback-control w-full border border-(--color-rule) bg-(--color-ink) py-3 text-sm text-(--color-paper) transition-opacity disabled:opacity-50"
      >
        {state === 'sending' ? 'Sending...' : 'Send me a sign-in link'}
      </button>

      {state === 'error' && (
        <p className="text-sm text-(--color-problem)">That did not send. Try again.</p>
      )}
    </form>
  )
}
