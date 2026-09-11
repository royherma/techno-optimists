import { useEffect, useState } from 'react'
import type { DetailPerson } from '../lib/api'
import { ACTION_DOING } from '../lib/vocab'

export default function PeopleLive({ slug, initial }: { slug: string; initial: DetailPerson[] }) {
  const [people, setPeople] = useState(initial)
  useEffect(() => {
    const actual = (window as unknown as { __LIVE_CHALLENGE__?: string }).__LIVE_CHALLENGE__ ?? slug
    let cancelled = false
    async function refresh() {
      try {
        const r = await fetch(`/api/challenges/${actual}`, { cache: 'no-store' })
        if (!r.ok) return
        const d = await r.json()
        if (!cancelled) setPeople(d.people)
      } catch { /* Keep the last confirmed people list. */ }
    }
    void refresh()
    window.addEventListener('challenge-action', refresh)
    return () => { cancelled = true; window.removeEventListener('challenge-action', refresh) }
  }, [slug])
  return <section className="people-panel detail-panel"><h2>People on this</h2>
    {people.length ? <ul>{people.map((p) => <li key={p.id}>
      <span className="person-avatar" aria-hidden="true">{p.handle.slice(0, 1).toUpperCase()}</span>
      <div><h3><a href={`/people?handle=${encodeURIComponent(p.handle)}`}>@{p.handle}</a></h3><p>{p.kinds.map((k) => ACTION_DOING[k]).join(' · ')}</p>
        <p className="person-skills">{p.skills.slice(0, 3).join(' · ')}{p.location && ` · ${p.location}`}</p></div>
    </li>)}</ul> : <p className="quiet-empty">A useful perspective can come from anyone. Choose how you can help above.</p>}
  </section>
}
