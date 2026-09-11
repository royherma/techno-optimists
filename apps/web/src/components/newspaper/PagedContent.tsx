import { useEffect, useRef, useState, type ReactNode } from 'react'

/** Browser column fragmentation paginates complete prose and existing forms.
 * Controls remain mounted, so changing pages never discards a draft.
 * Focus entering a later column turns to that page, including native validation.
 */
export default function PagedContent({ children, label = 'Reading', resetKey = '' }: { children: ReactNode; label?: string; resetKey?: string }) {
  const viewport = useRef<HTMLDivElement>(null)
  const flow = useRef<HTMLDivElement>(null)
  const [page, setPage] = useState(0)
  const [pages, setPages] = useState(1)
  const pageRef = useRef(0)
  const widthRef = useRef(0)
  function turn(next: number) {
    const bounded = Math.max(0, Math.min(pages - 1, next))
    setPage(bounded); pageRef.current = bounded
    if (viewport.current) viewport.current.scrollLeft = bounded * (widthRef.current + 32)
  }
  useEffect(() => { setPage(0); pageRef.current = 0; if (viewport.current) viewport.current.scrollLeft = 0 }, [resetKey])
  useEffect(() => {
    const box = viewport.current!, content = flow.current!
    let frame = 0
    const measure = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        if (!box.clientWidth || !box.clientHeight) return
        widthRef.current = box.clientWidth
        const count = Math.max(1, Math.ceil((content.scrollWidth + 32) / (box.clientWidth + 32)))
        setPages(count)
        const current = Math.min(pageRef.current, count - 1)
        pageRef.current = current; setPage(current)
        box.scrollLeft = current * (box.clientWidth + 32)
      })
    }
    const size = new ResizeObserver(measure); size.observe(box)
    const changes = new MutationObserver(measure); changes.observe(content, { childList: true, subtree: true, attributes: true, characterData: true })
    content.addEventListener('load', measure, true)
    document.fonts.ready.then(measure)
    const focus = (event: FocusEvent) => {
      const element = event.target as HTMLElement
      const left = element.getBoundingClientRect().left - box.getBoundingClientRect().left + box.scrollLeft
      const next = Math.max(0, Math.floor((left + 2) / (box.clientWidth + 32)))
      setPage(next); pageRef.current = next; box.scrollLeft = next * (box.clientWidth + 32)
    }
    content.addEventListener('focusin', focus)
    measure()
    return () => { cancelAnimationFrame(frame); size.disconnect(); changes.disconnect(); content.removeEventListener('load', measure, true); content.removeEventListener('focusin', focus) }
  }, [])
  return <div className="np-paged">
    <div className="np-page-window" ref={viewport} aria-label={label}>
      <div className="np-page-flow" ref={flow}>{children}</div>
    </div>
    <nav className="np-page-controls" aria-label={`${label} pages`}><span aria-live="polite">{label} · {page + 1} / {pages}</span><div><button type="button" disabled={page === 0} onClick={() => turn(page - 1)}>← Previous</button><button type="button" disabled={page + 1 >= pages} onClick={() => turn(page + 1)}>Next →</button></div></nav>
  </div>
}
