import { useEffect, useRef, useState } from 'react'
import type { ChallengeType, Media } from '../../../../packages/types/index'
import { TYPE_LABEL } from '../lib/vocab'
import { getMe, type Me } from '../lib/session'
import { snack } from '../lib/snack'
import PlacePicker from './PlacePicker'

/**
 * Posting a Challenge.
 *
 * The order on the page is the order of the real act: you saw something, so the
 * photo comes first and the words come after. `capture="environment"` opens the
 * rear camera straight from the button on a phone, which is the whole point -
 * spotting a problem and posting it should not require going home first.
 *
 * Upload starts the moment a file is chosen, in parallel with the typing, so
 * the submit at the end is only ever a small JSON POST.
 */

const TYPES: ChallengeType[] = ['problem', 'idea', 'experiment', 'build']

const TYPE_HINT: Record<ChallengeType, string> = {
  problem: 'Something that does not work',
  idea: 'Something that could exist',
  experiment: 'Something you are trying',
  build: 'Something you are making',
}

type Shot = {
  id: string
  file: File
  preview: string
  state: 'uploading' | 'done' | 'failed'
  media?: Media
  /** The file's own shape, so the thumbnail is never a crop of a guess. */
  w?: number
  h?: number
}

/**
 * Reads a picked file's intrinsic size in the browser.
 *
 * Videos go through a <video> element and stills through Image(), because a
 * still decoder returns nothing for a movie and vice versa. Either can fail -
 * an HEIC that Safari renders and Chrome does not, a codec the browser lacks -
 * so this resolves null rather than rejecting, and the caller uploads anyway.
 */
async function measure(shot: Shot): Promise<{ w: number; h: number } | null> {
  const video = shot.file.type.startsWith('video/')
  return new Promise((resolve) => {
    const done = (v: { w: number; h: number } | null) => resolve(v?.w && v?.h ? v : null)
    if (video) {
      const el = document.createElement('video')
      el.preload = 'metadata'
      el.onloadedmetadata = () => done({ w: el.videoWidth, h: el.videoHeight })
      el.onerror = () => done(null)
      el.src = shot.preview
      return
    }
    const img = new Image()
    img.onload = () => done({ w: img.naturalWidth, h: img.naturalHeight })
    img.onerror = () => done(null)
    img.src = shot.preview
  })
}

export default function CaptureForm() {
  const [me, setMe] = useState<Me | null | undefined>(undefined)
  const [type, setType] = useState<ChallengeType>('problem')
  const [title, setTitle] = useState('')
  const [summary, setSummary] = useState('')
  const [body, setBody] = useState('')
  const [location, setLocation] = useState('')
  // The pin, kept separate from the typed label: they are set independently and
  // either one alone is a valid answer to "where".
  const [lat, setLat] = useState<number | null>(null)
  const [lng, setLng] = useState<number | null>(null)
  const [tags, setTags] = useState('')
  const [shots, setShots] = useState<Shot[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => { getMe().then(setMe) }, [])

  // Object URLs are only freed on unmount: revoking on every shots change would
  // pull the image out from under a preview that is still on screen.
  useEffect(() => () => { shots.forEach((s) => URL.revokeObjectURL(s.preview)) }, [])

  async function addFiles(files: FileList | null) {
    if (!files?.length) return
    const room = 8 - shots.length
    for (const file of Array.from(files).slice(0, room)) {
      const shot: Shot = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        file,
        preview: URL.createObjectURL(file),
        state: 'uploading',
      }
      setShots((s) => [...s, shot])
      upload(shot)
    }
  }

  async function upload(shot: Shot) {
    try {
      // Measure before sending so the preview can take the file's real shape
      // straight away. The Worker re-reads the header and its answer wins; this
      // one only has to be good enough to lay out the thumbnail.
      const size = await measure(shot)
      if (size) setShots((s) => s.map((x) => (x.id === shot.id ? { ...x, ...size } : x)))

      const r = await fetch('/api/uploads', {
        method: 'PUT',
        headers: { 'content-type': shot.file.type || 'application/octet-stream' },
        credentials: 'same-origin',
        body: shot.file,
      })
      if (!r.ok) throw new Error(String(r.status))
      const { media } = await r.json()
      // The Worker reads the file header, so its size is the authority. This
      // only fills in what it could not parse - a video, or an HEIC it declined.
      const withSize: Media = { ...media, w: media.w ?? size?.w, h: media.h ?? size?.h }
      setShots((s) => s.map((x) => (x.id === shot.id ? { ...x, state: 'done', media: withSize } : x)))
    } catch {
      setShots((s) => s.map((x) => (x.id === shot.id ? { ...x, state: 'failed' } : x)))
      // The thumbnail says "failed" in 10px type at the bottom of one tile.
      // On a phone, mid-scroll, with the words still being typed, that is not
      // where the reader is looking - and a Challenge posts without the photo
      // they thought they had attached.
      snack('A photo did not upload. Remove it or try again.', 'problem')
    }
  }

  const uploading = shots.some((s) => s.state === 'uploading')
  const ready = title.trim().length >= 8 && summary.trim().length >= 10 && !uploading

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!ready || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const r = await fetch('/api/challenges', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          type,
          title: title.trim(),
          summary: summary.trim(),
          body: body.trim() || undefined,
          location: location.trim() || undefined,
          // Sent only as a complete pair - the API rejects a lone coordinate,
          // and a half-pair is not a position anyway.
          lat: lat ?? undefined,
          lng: lng ?? undefined,
          tags: tags.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 6),
          media: shots.filter((s) => s.media).map((s) => s.media),
        }),
      })
      // A session can expire while a Challenge is being written, and "try
      // again" sends the writer back into the same 401 forever. Sign in and
      // come back to the form, the way the action bar already does.
      if (r.status === 401) {
        window.location.href = '/signin?next=/post'
        return
      }
      if (!r.ok) throw new Error(String(r.status))
      const { challenge } = await r.json()
      window.location.href = `/c/${challenge.slug}`
    } catch {
      setError('That did not post. Your photos are still here - try again.')
      setSubmitting(false)
    }
  }

  if (me === undefined) return <p className="text-sm text-(--color-ink-faint)">Loading...</p>

  if (me === null) {
    return (
      <div className="space-y-3">
        <p className="text-(--color-ink-soft)">Sign in to post a Challenge.</p>
        <a href="/signin?next=/post" className="inline-block border border-(--color-rule) px-5 py-2.5 text-sm">
          Sign in
        </a>
      </div>
    )
  }

  return (
    <form onSubmit={submit} className="space-y-8">
      {/* The photo comes first because that is the order of the real act. */}
      <section className="space-y-3">
        <Legend n="01" label="What you saw" />
        <div className="flex flex-wrap gap-3">
          {/*
            The thumbnail keeps the photo's own shape, bounded so a panorama
            cannot run off the row and a tall portrait cannot tower over it.
            Contain, not cover: this is the last look before posting, so it has
            to show what will actually be sent.
          */}
          {shots.map((shot) => (
            <figure
              key={shot.id}
              className="relative h-28 overflow-hidden border border-(--color-rule-soft) bg-(--color-paper-sunk)"
              style={{ aspectRatio: shot.w && shot.h ? Math.min(2.2, Math.max(0.55, shot.w / shot.h)) : 1 }}
            >
              <img src={shot.preview} alt="" className="h-full w-full object-contain" />
              {shot.state !== 'done' && (
                <figcaption
                  className={`absolute inset-x-0 bottom-0 py-1 text-center font-[family-name:--font-mono] text-[10px] ${
                    shot.state === 'failed'
                      ? 'bg-(--color-problem) text-(--color-paper)'
                      : 'bg-(--color-ink) text-(--color-paper)'
                  }`}
                >
                  {shot.state === 'failed' ? 'failed' : 'sending'}
                </figcaption>
              )}
              <button
                type="button"
                onClick={() => setShots((s) => s.filter((x) => x.id !== shot.id))}
                aria-label="Remove photo"
                className="absolute top-1 right-1 h-6 w-6 bg-(--color-paper) text-xs leading-none text-(--color-ink)"
              >
                x
              </button>
            </figure>
          ))}

          {shots.length < 8 && (
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="h-28 w-28 border border-dashed border-(--color-rule-soft) text-sm text-(--color-ink-soft) hover:border-(--color-rule) hover:text-(--color-ink)"
            >
              + Photo
            </button>
          )}
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="image/*,video/*"
          capture="environment"
          multiple
          hidden
          onChange={(e) => { addFiles(e.target.files); e.target.value = '' }}
        />
        <p className="text-xs text-(--color-ink-faint)">
          A photo of the real thing helps more than any description. Optional.
        </p>
      </section>

      <section className="space-y-3">
        <Legend n="02" label="What kind of thing is it" />
        <div className="flex flex-wrap gap-2">
          {TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              aria-pressed={type === t}
              className={`border px-4 py-2 text-sm ${
                type === t
                  ? 'border-(--color-rule) bg-(--color-paper-sunk)'
                  : 'border-(--color-rule-soft) text-(--color-ink-soft) hover:border-(--color-rule)'
              }`}
              
            >
              {TYPE_LABEL[t]}
            </button>
          ))}
        </div>
        <p className="text-xs text-(--color-ink-faint)">{TYPE_HINT[type]}</p>
      </section>

      <section className="space-y-5">
        <Legend n="03" label="In your words" />
        <Field
          name="title"
          label="One line"
          hint="Say the thing itself. 'The irrigation timer cracks every summer in direct sun.'"
          value={title}
          onChange={setTitle}
          maxLength={140}
          min={8}
        />
        <Field
          name="summary"
          label="A little more"
          hint="What happens, how often, what it costs."
          value={summary}
          onChange={setSummary}
          maxLength={280}
          min={10}
          rows={3}
        />
        <Field
          name="body"
          label="Everything else"
          hint="Optional. What you have tried, what you know, what you do not."
          value={body}
          onChange={setBody}
          maxLength={20000}
          rows={5}
          optional
        />
      </section>

      <section className="space-y-5">
        <Legend n="04" label="Where it is" />
        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            name="location"
            label="Place name"
            hint="How you would say it out loud. 'Chiang Mai, Thailand'."
            value={location}
            onChange={setLocation}
            maxLength={120}
            optional
          />
          <Field name="tags" label="Tags" hint="Comma separated. Up to six." value={tags} onChange={setTags} maxLength={200} optional />
        </div>
        <PlacePicker lat={lat} lng={lng} onChange={(la, ln) => { setLat(la); setLng(ln) }} />
      </section>

      <div className="space-y-3 border-t border-(--color-rule-soft) pt-6">
        <button
          type="submit"
          disabled={!ready || submitting}
          className="w-full border border-(--color-rule) bg-(--color-ink) py-3.5 text-sm text-(--color-paper) disabled:opacity-40"
        >
          {submitting ? 'Posting...' : uploading ? 'Waiting for photos...' : 'Post this Challenge'}
        </button>
        {error && <p className="text-sm text-(--color-problem)">{error}</p>}
        <p className="text-center text-xs text-(--color-ink-faint)">
          Posted as @{me.handle}
        </p>
      </div>
    </form>
  )
}

const Legend = ({ n, label }: { n: string; label: string }) => (
  <div className="form-section-heading">
    <span className="font-[family-name:--font-mono] text-[11px] text-(--color-ink-faint)">{n}</span>
    <span className="font-[family-name:--font-mono] text-[11px] tracking-[0.14em] text-(--color-ink-soft) uppercase">{label}</span>
  </div>
)

function Field({ name, label, hint, value, onChange, maxLength, min, rows, optional }: {
  name: string
  label: string
  hint: string
  value: string
  onChange: (v: string) => void
  maxLength: number
  min?: number
  rows?: number
  optional?: boolean
}) {
  const short = min !== undefined && value.trim().length > 0 && value.trim().length < min
  const hintId = `${name}-hint`
  return (
    <label className="block">
      <span className="font-[family-name:--font-mono] text-[11px] tracking-[0.14em] text-(--color-ink-faint) uppercase">
        {label}{optional && <span className="normal-case tracking-normal"> - optional</span>}
      </span>
      {rows ? (
        <textarea
          id={name}
          name={name}
          rows={rows}
          value={value}
          maxLength={maxLength}
          aria-describedby={hintId}
          onChange={(e) => onChange(e.target.value)}
          className="mt-2 w-full resize-y border border-(--color-rule-soft) bg-transparent p-3 text-(--color-ink) outline-none focus:border-(--color-rule)"
        />
      ) : (
        <input
          type="text"
          id={name}
          name={name}
          value={value}
          maxLength={maxLength}
          aria-describedby={hintId}
          onChange={(e) => onChange(e.target.value)}
          className="mt-2 w-full border-b border-(--color-rule-soft) bg-transparent pb-2 text-(--color-ink) outline-none focus:border-(--color-rule)"
        />
      )}
      <span id={hintId} className="mt-1.5 block text-xs text-(--color-ink-faint)">
        {short ? `A few more words - ${min} at least.` : hint}
      </span>
    </label>
  )
}
