import { useEffect, useRef, useState } from 'react'
import { CHALLENGE_TYPES, type Challenge } from '../../../../../packages/types'
import { STAGE_ORDER } from '../../lib/vocab'
import { useFeed } from './useFeed'
import StoryTile from './StoryTile'
import StoryRow from './StoryRow'
import './loading.css'

/**
 * List view is a reading preference, not a filter, so it lives in the URL and in
 * localStorage: the URL makes a list-view link shareable, localStorage makes the
 * choice survive a visit to a thread and back.
 */
type View = 'grid' | 'list'
const VIEW_KEY = 'np-front-view'
function storedView(): View | null {
  try { return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : localStorage.getItem(VIEW_KEY) === 'grid' ? 'grid' : null } catch { return null }
}
function readView(): View {
  const param = new URLSearchParams(location.search).get('view')
  if (param === 'list' || param === 'grid') return param
  return storedView() || 'grid'
}

/**
 * Sorting is a list-view affordance. The columns that sort are the ones holding
 * a value you can rank; the thumbnail is not one, so it stays inert.
 *
 * Each key carries its own natural first direction. Clicking Added should show
 * the newest thread, not the oldest, and clicking Thread should start at A - a
 * single global default would be wrong for half of these.
 */
type SortKey = 'type' | 'stage' | 'title' | 'place' | 'added' | 'prize' | 'signals'
const SORT_FIRST: Record<SortKey, 'asc' | 'desc'> = { type: 'asc', stage: 'asc', title: 'asc', place: 'asc', added: 'desc', prize: 'desc', signals: 'desc' }
/** Header order after the thumbnail cell, which has nothing to rank. */
const SORT_COLUMNS: [SortKey, string][] = [['type', 'Type'], ['stage', 'Stage'], ['title', 'Thread'], ['place', 'Place'], ['added', 'Added'], ['prize', 'Prize'], ['signals', 'Signals']]

/**
 * The rank of a row for one key. Strings compare with localeCompare at the call
 * site; everything here is a number so the comparator stays one shape.
 *
 * Missing values (no location, no prize, no date) always sink to the bottom
 * regardless of direction - a row with nothing to rank is not "the smallest",
 * it is unrankable, and floating it to the top on an ascending sort would bury
 * the rows the reader actually asked to see.
 */
function sortValue(c: Challenge, key: SortKey): number | string | null {
  switch (key) {
    case 'type': return CHALLENGE_TYPES.indexOf(c.type)
    case 'stage': return STAGE_ORDER.indexOf(c.stage)
    case 'title': return c.title.toLowerCase()
    case 'place': return c.location ? c.location.toLowerCase() : null
    case 'added': { const d = c.imported_at || c.created_at; return d ? Date.parse(d) : null }
    // Amounts are minor units and may be in different currencies, so this ranks
    // by the number a sponsor published, not by converted value.
    case 'prize': return c.prize?.amount ?? null
    case 'signals': return (c.type === 'problem' ? c.actions.have_problem : c.actions.want_this) + c.actions.have_idea + c.actions.can_help
  }
}

export default function FrontPage({ initial }: { initial: Challenge[] }) {
  const { challenges, error, loading } = useFeed(initial)
  const [type, setType] = useState('all')
  const [view, setView] = useState<View>('grid')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const [size, setSize] = useState(1)
  const [rowSize, setRowSize] = useState(8)
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' } | null>(null)
  const [measured, setMeasured] = useState(false)
  const frame = useRef<HTMLDivElement>(null)
  /**
   * How many rows fit, measured from a rendered row. The first list render has no
   * row to measure, so this runs again once rows exist; `.np-news-list` is a fixed
   * flex child with overflow hidden, so its height does not move when the count
   * does and the second pass settles rather than oscillating.
   */
  const measureRows = () => {
    const box = frame.current
    if (!box) return
    const list = box.querySelector('.np-news-list')
    const row = box.querySelector<HTMLElement>('.np-row:not(.np-row-head)')
    const head = box.querySelector<HTMLElement>('.np-row-head')
    // Exactly one of these is visible at a time, so both are measured and the
    // hidden one contributes nothing.
    const bar = box.querySelector<HTMLElement>('.np-row-sortbar')
    const rowH = row?.getBoundingClientRect().height || 55
    const chrome = (head?.getBoundingClientRect().height || 25) + (bar?.getBoundingClientRect().height || 0)
    const available = (list?.clientHeight || box.clientHeight) - chrome
    setRowSize(Math.max(3, Math.floor(available / rowH)))
  }
  useEffect(() => {
    const resize = () => {
      const box = frame.current!
      setSize(box.clientWidth >= 980 && box.clientHeight >= 580 ? 5 : box.clientWidth >= 680 && box.clientHeight >= 440 ? 3 : 1)
      measureRows()
      setPage(0); setMeasured(true)
    }
    const observer = new ResizeObserver(resize); observer.observe(frame.current!)
    const sync = () => { setType(new URLSearchParams(location.search).get('type') || 'all'); setView(readView()); setPage(0) }
    resize(); sync(); window.addEventListener('resize', resize); window.addEventListener('popstate', sync)
    return () => { observer.disconnect(); window.removeEventListener('resize', resize); window.removeEventListener('popstate', sync) }
  }, [])
  function chooseView(next: View) {
    setView(next); setPage(0)
    try { localStorage.setItem(VIEW_KEY, next) } catch { /* private mode: the URL still carries it */ }
    const url = new URL(location.href)
    if (next === 'grid') url.searchParams.delete('view'); else url.searchParams.set('view', next)
    history.replaceState(history.state, '', url)
  }
  const matched = challenges.filter(c => (type === 'all' || c.type === type) && `${c.title} ${c.summary} ${c.location || ''}`.toLowerCase().includes(query.toLowerCase()))
  // No sort chosen means the feed's own order, which is the editorial one.
  /**
   * Click cycles natural direction -> reverse -> off. The third click matters:
   * the unsorted feed is the editorial order, and without a way back a reader
   * who sorted once could never see it again short of a reload.
   */
  function toggleSort(key: SortKey) {
    setPage(0)
    setSort(s => s?.key !== key ? { key, dir: SORT_FIRST[key] }
      : s.dir === SORT_FIRST[key] ? { key, dir: SORT_FIRST[key] === 'asc' ? 'desc' : 'asc' }
      : null)
  }
  const filtered = sort ? [...matched].sort((a, b) => {
    const av = sortValue(a, sort.key), bv = sortValue(b, sort.key)
    if (av === null || bv === null) return av === bv ? 0 : av === null ? 1 : -1
    const cmp = typeof av === 'string' ? av.localeCompare(bv as string) : av - (bv as number)
    return sort.dir === 'asc' ? cmp : -cmp
  }) : matched
  const perPage = view === 'list' ? rowSize : size
  const pages = Math.max(1, Math.ceil(filtered.length / perPage)), current = Math.min(page, pages - 1)
  const stories = filtered.slice(current * perPage, (current + 1) * perPage)
  const pending = !measured || loading
  // Rows only exist after the list has painted once, so the first measurement
  // used the fallback height. Re-measure against a real row now.
  const listLive = view === 'list' && !pending
  useEffect(() => { if (listLive) measureRows() }, [listLive])
  const empty = <div className="np-empty"><h2>{query || type !== 'all' ? 'A different angle, perhaps?' : 'What could be better?'}</h2><p>{query || type !== 'all' ? 'No threads match your search. Try another search or return to all threads.' : 'A real problem. An unfinished idea. Something worth figuring out together.'}</p><a href="/">All threads →</a><a href="/post">Share a thread →</a></div>
  return <div className="np-front" ref={frame}>
    <div className="np-front-tools"><h1>{type === 'all' ? 'Explore threads' : type.charAt(0).toUpperCase() + type.slice(1) + 's'}</h1>
      <div className="np-front-controls">
        <label><img src="/icons/magnifying-glass.svg" alt="" /><input type="search" placeholder="Search threads" aria-label="Search threads" value={query} onChange={e => { setQuery(e.target.value); setPage(0) }} /></label>
        <div className="np-view-toggle" role="group" aria-label="Feed layout">
          <button type="button" aria-pressed={view === 'grid'} onClick={() => chooseView('grid')}>Edition</button>
          <button type="button" aria-pressed={view === 'list'} onClick={() => chooseView('list')}>List</button>
        </div>
      </div>
    </div>
    {view === 'list'
      ? <div className={`np-news-list ${pending ? '' : 'np-edition-ready'}`} aria-busy={pending}>
          {pending ? Array.from({ length: 8 }, (_, i) => <div key={i} className="np-row np-skeleton" aria-hidden="true">
            <span className="np-row-thumb np-skeleton-image" /><span className="np-skeleton-meta" /><span className="np-skeleton-meta" /><div className="np-skeleton-headline"><i /></div><span className="np-skeleton-meta" /><span className="np-skeleton-meta" /><span className="np-skeleton-meta" /><span className="np-skeleton-meta" />
          </div>) : <>
            <header className="np-row np-row-head">
              <span />
              {SORT_COLUMNS.map(([key, label]) => <span key={key} className={sort?.key === key ? 'np-sorted' : ''}>
                <button type="button" onClick={() => toggleSort(key)}
                  aria-label={`Sort by ${label}${sort?.key === key ? `, currently ${sort.dir === 'asc' ? 'ascending' : 'descending'}` : ''}`}>
                  {label}<i aria-hidden="true">{sort?.key === key ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}</i>
                </button>
              </span>)}
            </header>
            {/* Narrow screens hide the header, because three columns cannot carry
              * seven labels. Sorting still has to be reachable, so it appears as
              * its own control there instead. */}
            <div className="np-row-sortbar">
              <span>Sort</span>
              {SORT_COLUMNS.map(([key, label]) => <button key={key} type="button" aria-pressed={sort?.key === key} onClick={() => toggleSort(key)}>
                {label}{sort?.key === key && <i aria-hidden="true">{sort.dir === 'asc' ? '▲' : '▼'}</i>}
              </button>)}
            </div>
            {stories.map(c => <StoryRow key={c.id} challenge={c} />)}
            {!stories.length && empty}
          </>}
        </div>
      : <div className={`np-news-grid ${pending ? '' : `np-news-count-${stories.length}`} ${pending ? 'np-loading-grid' : 'np-edition-ready'}`} aria-busy={pending}>
          {pending ? Array.from({ length: 5 }, (_, i) => <div key={i} className={`np-story np-skeleton ${i === 0 ? 'np-lead' : ''}`} aria-hidden="true">
            <div className="np-story-image np-skeleton-image" />
            <div className="np-story-copy"><div className="np-skeleton-meta" /><div className="np-skeleton-headline"><i /><i /><i /></div><div className="np-skeleton-lines"><i /><i /><i /></div><footer><span className="np-skeleton-meta" /></footer></div>
          </div>) : <>
            {stories.map((c, i) => <StoryTile key={c.id} challenge={c} lead={i === 0} brief={false} />)}
            {!stories.length && empty}
          </>}
        </div>}
    <footer className="np-page-controls"><span aria-live="polite">{pending ? 'Setting the edition…' : error ? (challenges.length ? 'Live refresh unavailable · showing saved threads' : 'Threads unavailable · please reload') : `${filtered.length ? current * perPage + 1 : 0}–${Math.min((current + 1) * perPage, filtered.length)} of ${filtered.length} threads`}</span><div><button disabled={pending || current === 0} onClick={() => setPage(current - 1)}>← Previous</button><button disabled={pending || current + 1 >= pages} onClick={() => setPage(current + 1)}>More threads →</button></div></footer>
  </div>
}
