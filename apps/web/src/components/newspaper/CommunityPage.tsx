import { useEffect, useState } from 'react'
import type { Challenge } from '../../../../../packages/types'
import PublicProfile from '../PublicProfile'
import PagedContent from './PagedContent'
export default function CommunityPage({ challenges }: { challenges: Challenge[] }) {
  const [handle, setHandle] = useState('')
  useEffect(() => setHandle(new URLSearchParams(location.search).get('handle') || ''), [])
  const authors = Array.from(new Map(challenges.map(c => [c.author.handle, c.author])).values())
  return <PagedContent label="Community">{handle ? <PublicProfile /> : <div className="np-community"><h1>People who notice.<br />People who build.</h1><p className="np-deck">Explore the people sharing threads in this edition.</p>{authors.map(person => <article key={person.id}><h2><a href={'/people?handle=' + encodeURIComponent(person.handle)}>@{person.handle} →</a></h2><p>{person.location || 'Part of a global conversation'}</p><ul>{challenges.filter(c => c.author.handle === person.handle).map(c => <li key={c.id}><a href={'/c/' + c.slug}>{c.title}</a></li>)}</ul></article>)}{!authors.length && <p>The next story could be yours. <a href="/post">Share a thread →</a></p>}</div>}</PagedContent>
}
