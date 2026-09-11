import { useEffect, useState } from 'react'
import type { Me } from '../lib/session'
import MyActivity from './MyActivity'
import SettingsForm from './SettingsForm'

const tabs = [ ['activity', 'Your threads'], ['profile', 'Profile'], ['skills', 'Skills & roles'], ['signin', 'Sign-in'] ] as const
export default function AccountWorkspace() {
  const [active, setActive] = useState('activity')
  const [person, setPerson] = useState<Me | null>()
  const [error, setError] = useState(false)
  async function load() {
    setError(false)
    try {
      const r = await fetch('/api/auth/me', { cache: 'no-store' })
      if (r.status === 401) { setPerson(null); return }
      if (!r.ok) throw new Error('account')
      setPerson((await r.json()).person ?? null)
    } catch { setError(true) }
  }
  useEffect(() => {
    const sync = () => setActive(tabs.some(([id]) => id === location.hash.slice(1)) ? location.hash.slice(1) : 'activity')
    sync(); void load()
    window.addEventListener('hashchange', sync)
    window.addEventListener('popstate', sync)
    return () => { window.removeEventListener('hashchange', sync); window.removeEventListener('popstate', sync) }
  }, [])
  function select(id: string) { setActive(id); history.pushState(null, '', `#${id}`); document.querySelector('.account-body')?.scrollTo(0, 0) }
  return <div className="account-workspace">
    <header className="account-header"><div><span className="account-eyebrow">Your space</span><h1>Your account</h1></div><p>Keep track of your threads.<br />Make your skills part of what happens next.</p></header>
    <div className="account-tabs" role="tablist" aria-label="Account sections">{tabs.map(([id, label], index) => <button key={id} id={`account-tab-${id}`} type="button" role="tab" aria-selected={active === id} aria-controls={id === 'activity' ? 'account-panel-activity' : 'account-panel-settings'} tabIndex={active === id ? 0 : -1} onClick={() => select(id)} onKeyDown={(e) => {
      const next = e.key === 'ArrowRight' ? (index + 1) % tabs.length : e.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : -1
      if (next < 0) return
      e.preventDefault(); select(tabs[next][0]); document.getElementById(`account-tab-${tabs[next][0]}`)?.focus()
    }}>{label}</button>)}</div>
    <div className="account-body">
      {error ? <div className="account-empty"><h2>Your account could not load</h2><p>Your connection may have dropped.</p><button onClick={() => void load()}>Try again</button></div> : person === undefined ? <p role="status">Loading your account...</p> : person === null ? <div className="account-empty"><h2>A place for your next step</h2><p>Sign in to find your marked threads and manage your profile.</p><a className="account-primary" href={`/signin?next=${encodeURIComponent(`/settings#${active}`)}`}>Sign in to your account</a></div> : <>
        <section role="tabpanel" id="account-panel-activity" aria-labelledby="account-tab-activity" hidden={active !== 'activity'} tabIndex={0}><MyActivity /></section>
        <div className="form-surface" hidden={active === 'activity'} role="tabpanel" id="account-panel-settings" aria-labelledby={`account-tab-${active === 'activity' ? 'profile' : active}`} tabIndex={0}><SettingsForm person={person} section={active} /></div>
      </>}
    </div>
  </div>
}
