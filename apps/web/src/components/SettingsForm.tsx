import { useEffect, useState } from 'react'
import { ROLES, type Role } from '../../../../packages/types/index'
import { signOut, type Me } from '../lib/session'
import { snack } from '../lib/snack'

/**
 * The reader's own account.
 *
 * Handle first, because it is the one field that is public and the one thing
 * people had no way to change until this page existed - a signup handle is
 * derived from an email local part, so `sam.rivera@example.com` became `samrivera`
 * without anyone choosing it.
 *
 * Email is shown and never editable. It is what the magic link proves ownership
 * of, so moving it is a change of identity that has to go back through the
 * mailbox; the API refuses it too, and this input being absent is the honest
 * shape of that rule rather than a disabled box that looks like a bug.
 */

const ROLE_HINT: Record<Role, string> = {
  scout: 'You notice things worth fixing',
  thinker: 'You work out why something happens',
  researcher: 'You find out what is already known',
  builder: 'You make the thing',
  expert: 'You know a field deeply',
  tester: 'You try it in the real world',
}

const ROLE_LABEL: Record<Role, string> = {
  scout: 'Scout', thinker: 'Thinker', researcher: 'Researcher',
  builder: 'Builder', expert: 'Expert', tester: 'Tester',
}

export default function SettingsForm({ person, section }: { person: Me; section: string }) {
  const [me, setMe] = useState<Me | null | undefined>(undefined)
  const [handle, setHandle] = useState('')
  const [name, setName] = useState('')
  const [location, setLocation] = useState('')
  const [skills, setSkills] = useState('')
  const [roles, setRoles] = useState<Role[]>([])
  const [saving, setSaving] = useState(false)
  const [handleError, setHandleError] = useState<string | null>(null)

  useEffect(() => {
    Promise.resolve(person).then((m) => {
      setMe(m)
      if (!m) return
      setHandle(m.handle)
      setName(m.name)
      setLocation(m.location ?? '')
      setSkills((m.skills ?? []).join(', '))
      setRoles(m.roles ?? [])
    })
  }, [person])

  const toggleRole = (r: Role) =>
    setRoles((rs) => (rs.includes(r) ? rs.filter((x) => x !== r) : [...rs, r]))

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (saving || !me) return
    setSaving(true)
    setHandleError(null)
    try {
      const r = await fetch('/api/people/me', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          ...(section === 'profile' ? { handle: handle.trim(),
          name: name.trim(),
          location: location.trim() } : { 
          skills: skills.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 12),
          roles }),
        }),
      })

      // A session can expire while this page sits open. Sending the reader back
      // here afterwards means the edit they were making is the thing they
      // return to, not the home page.
      if (r.status === 401) {
        window.location.href = '/signin?next=/settings'
        return
      }

      const data = await r.json().catch(() => null)

      // The handle is the only field with a rule the reader can break, so its
      // refusal belongs beside the input rather than in a snack that scrolls
      // away from the box that caused it.
      if (r.status === 400 || r.status === 409) {
        if (data?.error === 'bad_handle') {
          setHandleError(data.message ?? 'That handle will not work.')
          return
        }
        setHandleError(null)
        snack('That did not save. Check the fields and try again.', 'problem')
        return
      }

      if (!r.ok) throw new Error(String(r.status))

      if (data?.person) {
        setMe(data.person)
        if (section === 'profile') setHandle(data.person.handle)
        window.dispatchEvent(new CustomEvent('profile-updated'))
      }
      snack('Saved.')
    } catch {
      snack('That did not save. Try again.', 'problem')
    } finally {
      setSaving(false)
    }
  }

  if (me === undefined) return <p className="text-sm text-(--color-ink-faint)">Loading...</p>

  if (me === null) {
    return (
      <div className="space-y-3">
        <p className="text-(--color-ink-soft)">Sign in to change your account.</p>
        <a href="/signin?next=/settings" className="feedback-control inline-block border border-(--color-rule) px-5 py-2.5 text-sm">
          Sign in
        </a>
      </div>
    )
  }

  return (
    <form onSubmit={save} className="space-y-8">
      <section hidden={section !== "profile"} className="space-y-5">
        <Legend n="01" label="Who you are here" />

        <label className="block">
          <span className="font-[family-name:var(--font-mono)] text-[11px] tracking-[0.14em] text-(--color-ink-faint) uppercase">
            Handle
          </span>
          <span className="mt-2 flex items-baseline gap-1 border-b border-(--color-rule-soft) focus-within:border-(--color-rule)">
            <span className="text-lg text-(--color-ink-faint)">@</span>
            <input
              type="text"
              name="handle"
              value={handle}
              maxLength={20}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              aria-describedby="handle-hint"
              onChange={(e) => { setHandle(e.target.value); setHandleError(null) }}
              className="w-full bg-transparent pb-2 text-lg text-(--color-ink) outline-none"
            />
          </span>
          <span
            id="handle-hint"
            className={`mt-1.5 block text-xs ${handleError ? 'text-(--color-problem)' : 'text-(--color-ink-faint)'}`}
          >
            {handleError ?? 'Letters, numbers and underscores. This is what everyone sees.'}
          </span>
        </label>

        <Field
          name="name"
          label="Name"
          hint="Only you see this. It is not printed next to your Challenges."
          value={name}
          onChange={setName}
          maxLength={80}
        />

        <Field
          name="location"
          label="Where you are"
          hint="Optional. How you would say it out loud - 'Chiang Mai, Thailand'."
          value={location}
          onChange={setLocation}
          maxLength={120}
          optional
        />
      </section>

      <section hidden={section !== "skills"} className="space-y-3">
        <Legend n="02" label="What you do" />
        <div className="account-roles">
          {ROLES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => toggleRole(r)}
              aria-pressed={roles.includes(r)}
              title={ROLE_HINT[r]}
              className={`border px-4 py-2 text-sm ${
                roles.includes(r)
                  ? 'border-(--color-rule) bg-(--color-paper-sunk)'
                  : 'border-(--color-rule-soft) text-(--color-ink-soft) hover:border-(--color-rule)'
              }`}
            >
              <strong>{ROLE_LABEL[r]}</strong><small>{ROLE_HINT[r]}</small>
            </button>
          ))}
        </div>
        <p className="text-xs text-(--color-ink-faint)">
          Pick any that fit. They help people find you when a Challenge needs what you do.
        </p>
      </section>

      <section hidden={section !== "skills"} className="space-y-5">
        <Legend n="03" label="What you are good at" />
        <Field
          name="skills"
          label="Skills"
          hint="Comma separated. Up to twelve. 'irrigation, 3d printing, arabic'."
          value={skills}
          onChange={setSkills}
          maxLength={400}
          optional
        />
      </section>

      <section hidden={section !== "signin"} className="space-y-3">
        <Legend n="04" label="Sign-in" />
        <p className="text-sm text-(--color-ink-soft)">
          You sign in with{' '}
          <span className="font-[family-name:var(--font-mono)] text-(--color-ink)">{me.email ?? 'a magic link'}</span>.
        </p>
        <p className="text-xs text-(--color-ink-faint)">
          Only you can see this address. It is never shown on your Challenges or to anyone else.
        </p>
        <button
          type="button"
          onClick={async () => {
            try { await signOut(); window.location.href = '/' }
            catch { snack('Could not sign out. Try again.', 'problem') }
          }}
          className="mt-2 border border-(--color-rule-soft) px-5 py-2.5 text-sm text-(--color-ink-soft) hover:border-(--color-rule) hover:text-(--color-ink)"
        >
          Sign out
        </button>
      </section>

      <div hidden={section === "signin"} className="account-save space-y-3 border-t border-(--color-rule-soft) pt-6">
        <button
          type="submit"
          disabled={saving}
          className="feedback-control w-full border border-(--color-rule) bg-(--color-ink) py-3.5 text-sm text-(--color-paper) disabled:opacity-40"
        >
          {saving ? 'Saving...' : section === 'profile' ? 'Save profile' : 'Save skills & roles'}
        </button>
        <p className="text-center text-xs text-(--color-ink-faint)">
          Posting as @{me.handle}
        </p>
      </div>
    </form>
  )
}

const Legend = ({ n, label }: { n: string; label: string }) => (
  <div className="form-section-heading">
    <span className="font-[family-name:var(--font-mono)] text-[11px] text-(--color-ink-faint)">{n}</span>
    <span className="font-[family-name:var(--font-mono)] text-[11px] tracking-[0.14em] text-(--color-ink-soft) uppercase">{label}</span>
  </div>
)

function Field({ name, label, hint, value, onChange, maxLength, optional }: {
  name: string
  label: string
  hint: string
  value: string
  onChange: (v: string) => void
  maxLength: number
  optional?: boolean
}) {
  const hintId = `${name}-hint`
  return (
    <label className="block">
      <span className="font-[family-name:var(--font-mono)] text-[11px] tracking-[0.14em] text-(--color-ink-faint) uppercase">
        {label}{optional && <span className="normal-case tracking-normal"> - optional</span>}
      </span>
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
      <span id={hintId} className="mt-1.5 block text-xs text-(--color-ink-faint)">{hint}</span>
    </label>
  )
}
