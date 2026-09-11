import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import PagedContent from './PagedContent'

/** A focused writing surface; closing it preserves the draft and the newspaper. */
export default function PanelDialog({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [host, setHost] = useState<Element | null>(null)
  useEffect(() => { setHost(document.querySelector('.newspaper')) }, [])
  useEffect(() => {
    if (!dialog.current) return
    if (open && !dialog.current.open) dialog.current.showModal()
    if (!open && dialog.current.open) dialog.current.close()
  }, [open, host])
  if (!host) return null
  return createPortal(<dialog ref={dialog} className="np-panel-dialog" aria-label={title} onCancel={event => { event.preventDefault(); onClose() }}>
    <header><h2>{title}</h2><button type="button" onClick={onClose}>Close ×</button></header>
    <PagedContent label={title}>{children}</PagedContent>
  </dialog>, host)
}
