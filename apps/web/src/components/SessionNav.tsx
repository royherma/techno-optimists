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
    <span className="flex items-center gap-3 font-[family-name:--font-mono] text-[0.7rem] tracking-[0.06em] uppercase">
      <a
        href="/post"
        className="ink-transition border border-(--color-rule) px-3 py-1.5 hover:bg-(--color-ink) hover:text-(--color-paper) active:bg-(--color-ink) active:text-(--color-paper-sunk)"
      >
        + Post
      </a>
      {me ? (
        <>
          {/*
            The handle is the way in to the account page. It was already
            printed here and already the thing a reader would point at to mean
            "me", so making it the link costs no room in a nav that has none.
          */}
          <a
            href="/settings"
            className="ink-transition ink-underline hidden text-(--color-ink-faint) hover:text-(--color-ink) hover:decoration-current sm:inline"
          >
            @{me.handle}
          </a>
          <button
            onClick={async () => { await signOut(); window.location.reload() }}
            className="ink-transition ink-underline text-(--color-ink-faint) hover:text-(--color-ink) hover:decoration-current"
          >
            Sign out
          </button>
        </>
      ) : (
        <a
          href={`/signin?next=${encodeURIComponent(window.location.pathname)}`}
          className="ink-transition ink-underline text-(--color-ink-faint) hover:text-(--color-ink) hover:decoration-current"
        >
          Sign in
        </a>
      )}
    </span>
  )
}
