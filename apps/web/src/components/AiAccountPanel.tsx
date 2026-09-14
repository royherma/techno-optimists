import { useEffect, useState } from 'react'
import '../styles/newspaper/compute.css'

/**
 * Connect an AI account, so runs on a thread are paid for by the reader's own
 * credits rather than the site's.
 *
 * The copy never says OAuth, PKCE, provider id, or API key. What a reader is
 * deciding is whether to point their own credits at other people's problems.
 * Everything else is plumbing.
 */

type Account = {
  provider: string
  provider_name: string
  label: string | null
  connected_at: string
  last_used_at: string | null
  revoked: boolean
}

/**
 * What a failed connect attempt means, in the reader's terms. The keys are the
 * `ai_error` values the callback redirects with, which are ProviderError kinds
 * plus the three the route itself decides.
 */
const ERRORS: Record<string, string> = {
  expired_code: 'That took too long and the link expired. Connect again.',
  expired: 'That took too long and the link expired. Connect again.',
  missing: 'That connection did not complete. Try again.',
  unknown: 'That connection could not be matched to your account. Sign in and connect again.',
  no_credit: 'That account has no credit available yet.',
  revoked: 'That account is no longer authorized. Connect again.',
  unavailable: 'The provider could not be reached. Try again in a moment.',
  refused: 'The provider refused that connection. Try again.',
}

const since = (iso: string) => {
  const d = new Date(iso.replace(' ', 'T') + 'Z')
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })
}

export default function AiAccountPanel() {
  const [account, setAccount] = useState<Account | null | undefined>()
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [problem, setProblem] = useState<string | null>(null)

  async function load() {
    try {
      const r = await fetch('/api/ai/account', { cache: 'no-store' })
      setAccount(r.ok ? ((await r.json()).account ?? null) : null)
    } catch { setAccount(null) }
  }

  useEffect(() => {
    // The callback redirects back here with its outcome in the query string.
    // Read it, then strip it, so a refresh does not replay a stale message.
    const params = new URLSearchParams(location.search)
    const failed = params.get('ai_error')
    if (failed) setProblem(ERRORS[failed] ?? ERRORS.unavailable)
    if (params.get('connected')) setNotice('Connected. Runs on a thread now use your credits.')
    if (failed || params.get('connected')) {
      params.delete('ai_error'); params.delete('connected')
      const q = params.toString()
      history.replaceState(null, '', `${location.pathname}${q ? `?${q}` : ''}${location.hash}`)
    }
    void load()
  }, [])

  async function disconnect() {
    setBusy(true); setProblem(null); setNotice(null)
    try {
      const r = await fetch('/api/ai/disconnect', { method: 'POST' })
      if (!r.ok) throw new Error('disconnect')
      setAccount(null)
      setNotice('Disconnected. Your credits are no longer used here.')
    } catch {
      setProblem('That did not go through. Try again.')
    } finally { setBusy(false) }
  }

  if (account === undefined) return <p role="status">Loading...</p>

  return <div className="ai-panel">
    <h2>Contribute compute</h2>
    <p className="ai-lede">
      Connect an AI account and the work you start on a thread runs on your credits.
      You are giving compute to a specific problem, and the thread says it was you.
    </p>

    {notice && <p className="ai-notice" role="status">{notice}</p>}
    {problem && <p className="ai-problem" role="alert">{problem}</p>}

    {account && !account.revoked ? <>
      <dl className="ai-facts">
        <div><dt>Account</dt><dd>{account.provider_name}{account.label ? ` · ${account.label}` : ''}</dd></div>
        <div><dt>Connected</dt><dd>{since(account.connected_at) ?? 'recently'}</dd></div>
        <div><dt>Last run</dt><dd>{account.last_used_at ? since(account.last_used_at) : 'Not used yet'}</dd></div>
      </dl>
      <div className="ai-actions">
        <a className="ai-secondary" href="https://openrouter.ai/credits" target="_blank" rel="noreferrer">Manage credits</a>
        <button type="button" className="ai-secondary" disabled={busy} onClick={() => void disconnect()}>
          {busy ? 'Disconnecting...' : 'Disconnect'}
        </button>
      </div>
      <p className="ai-fine">You keep control of the account and can disconnect at any time.</p>
    </> : <>
      {account?.revoked && <p className="ai-problem" role="alert">
        That account is no longer authorized. Connect again to keep contributing.
      </p>}
      <a className="ai-primary" href={`/api/ai/connect?next=${encodeURIComponent('/settings#compute')}`}>
        {account?.revoked ? 'Reconnect an AI account' : 'Connect an AI account'}
      </a>
      <p className="ai-fine">
        Works with OpenRouter, which reaches frontier models from Anthropic, OpenAI and Google
        on one balance. You keep control of the account and can disconnect at any time.
      </p>
    </>}
  </div>
}
