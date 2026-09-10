import { useState } from 'react'

/**
 * Sign-in is one field. No password to choose, no confirmation step, no
 * account to "create" - the link in the mail does all of it.
 */
/** Where the reader was headed before we asked them to sign in. */
const nextPath = () => new URLSearchParams(window.location.search).get('next') ?? undefined

export default function SignInForm() {
  const [email, setEmail] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [devLink, setDevLink] = useState<string | null>(null)

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
        <p className="font-[family-name:--font-display] text-2xl text-(--color-ink)">Check your mail</p>
        <p className="text-sm text-(--color-ink-soft)">
          A sign-in link is on its way to <span className="text-(--color-ink)">{email}</span>.
          It works once and expires in 15 minutes.
        </p>
        {devLink && (
          <a
            href={devLink}
            className="mt-2 inline-block border-b border-(--color-grid-ink) font-[family-name:--font-mono] text-xs text-(--color-grid-ink)"
          >
            Local link - no mail key set
          </a>
        )}
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <label className="block">
        <span className="font-[family-name:--font-mono] text-[11px] tracking-[0.14em] text-(--color-ink-faint) uppercase">
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
        className="w-full border border-(--color-rule) bg-(--color-ink) py-3 text-sm text-(--color-paper) transition-opacity disabled:opacity-50"
      >
        {state === 'sending' ? 'Sending...' : 'Send me a sign-in link'}
      </button>

      {state === 'error' && (
        <p className="text-sm text-(--color-problem)">That did not send. Try again.</p>
      )}
    </form>
  )
}
