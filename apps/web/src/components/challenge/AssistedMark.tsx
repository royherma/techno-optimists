import { useState } from 'react'

/**
 * The mark on a response that started as a model draft.
 *
 * The response is the author's - they chose to publish it and they could have
 * rewritten every word. What the mark says is how the first version got there,
 * and it opens onto the model's untouched original so the claim is checkable
 * rather than decorative. Loaded on demand: almost nobody opens it, and it is
 * a separate row on the server.
 */
export default function AssistedMark({ commentId, model }: { commentId: string; model: string }) {
  const [original, setOriginal] = useState<string | null>(null)
  const [state, setState] = useState<'idle' | 'loading' | 'missing'>('idle')

  async function open() {
    if (original || state !== 'idle') return
    setState('loading')
    try {
      const r = await fetch(`/api/comments/${encodeURIComponent(commentId)}/original`)
      const body = await r.json().catch(() => null)
      if (r.ok && typeof body?.original?.output === 'string') {
        setOriginal(body.original.output)
        setState('idle')
      } else setState('missing')
    } catch { setState('missing') }
  }

  return <details className="assisted-mark" onToggle={(e) => { if (e.currentTarget.open) void open() }}>
    <summary>Drafted with {model} on the author's own credits</summary>
    {state === 'loading' && <p className="assisted-wait">Loading the original…</p>}
    {state === 'missing' && <p className="assisted-wait">The original is not available.</p>}
    {original && <>
      <p className="assisted-wait">What the model wrote, before the author edited it:</p>
      <blockquote className="assisted-original">{original}</blockquote>
    </>}
  </details>
}
