import { useEffect, useState } from 'react'
import { getMe, signOut, type Me } from '../lib/session'

/**
 * Who you are, and the way in to posting. Renders nothing until the session is
 * known - a flash of "Sign in" for someone already signed in reads as a bug.
 */
export default function SessionNav() {
  const [me, setMe] = useState<Me | null | undefined>(undefined)
  // The server renders this with no session, so the first client render must
  // match it exactly - otherwise React throws a hydration mismatch (#418).
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    getMe().then(setMe)
  }, [])

  if (!mounted || me === undefined) return <span className="inline-block h-6" />

  return (
    <span className="flex items-center gap-3 font-mono text-[0.7rem] tracking-[0.06em] uppercase">
      <a href="/post" className="border border-(--color-rule) px-3 py-1.5 hover:bg-(--color-paper-sunk)">
        + Post
      </a>
      {me ? (
        <>
          <span className="hidden text-(--color-ink-faint) sm:inline">@{me.handle}</span>
          <button
            onClick={async () => { await signOut(); window.location.reload() }}
            className="text-(--color-ink-faint) hover:text-(--color-ink)"
          >
            Sign out
          </button>
        </>
      ) : (
        <a
          href={`/signin?next=${encodeURIComponent(window.location.pathname)}`}
          className="text-(--color-ink-faint) hover:text-(--color-ink)"
        >
          Sign in
        </a>
      )}
    </span>
  )
}
