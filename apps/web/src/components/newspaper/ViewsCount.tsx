import { useState } from 'react'
import PanelDialog from './PanelDialog'
import '../../styles/newspaper/challenge.css'
import '../../styles/newspaper/views.css'

export default function ViewsCount({ count, title }: { count: number; title: string }) {
  const [open, setOpen] = useState(false)
  return <>
    <button type="button" className="np-views" aria-label={`${count} views for ${title}`} onClick={() => setOpen(true)}>
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></svg>
      <span>{count.toLocaleString('en')}</span>
    </button>
    {open && <PanelDialog title="Thread views" open={open} onClose={() => setOpen(false)}>
      <h3>{title}</h3><p><strong>{count.toLocaleString('en')}</strong> {count === 1 ? 'view' : 'views'}</p>
      <p>Views count visits to this thread, including signed-out readers. Repeat visits from the same browser and connection count once per UTC day.</p>
      <p>Returning on another day adds another view. Browsing past a thread in the feed does not count as a view.</p>
    </PanelDialog>}
  </>
}
