/**
 * Slack alerts. One place, one catalogue.
 *
 *   import { notify } from './slack'
 *   notify(c, 'challenge_created', { slug, title, type, author })
 *
 * Same contract as track() in analytics.ts: fire and forget, never awaited by a
 * route, never allowed to throw into one. An alert pipe that can 500 a POST is
 * worse than no alert pipe.
 *
 * Channel ids and the bot token arrive as bindings because Workers has no
 * process.env. All four are optional, so dev and the build-time API run without
 * them - an unset token logs the line instead of posting it.
 *
 * PUBLIC REPO: .env.example carries empty placeholders only. Real values live in
 * .dev.vars locally and `wrangler secret put --env prod`.
 */
export type SlackEnv = {
  SLACK_BOT_TOKEN?: string
  SLACK_CHANNEL_GROWTH?: string
  SLACK_CHANNEL_PRODUCT?: string
  SLACK_CHANNEL_ALERTS?: string
}

// Logical channel -> the binding holding its id. Today all three resolve to the
// same channel; they stay separate names so splitting one out later is a secret
// change rather than a code change.
type Channel = 'growth' | 'product' | 'alerts'

const CHANNEL_BINDING: Record<Channel, keyof SlackEnv> = {
  growth: 'SLACK_CHANNEL_GROWTH',
  product: 'SLACK_CHANNEL_PRODUCT',
  alerts: 'SLACK_CHANNEL_ALERTS',
}

// An unset binding skips that channel rather than falling back to another one.
// A stray alert in the wrong channel trains the reader to ignore the channel,
// which costs more than the missed message.
const channelId = (env: SlackEnv, ch: Channel): string | undefined =>
  (env[CHANNEL_BINDING[ch]] as string | undefined) || undefined

// Bangkok, with seconds. These are read on a phone where the only question is
// "how long ago" - UTC forces a +7 in the reader's head, and Slack's own line
// stamp is minute-resolution, so two alerts seconds apart are indistinguishable
// without them.
const stamp = () => new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Bangkok', hour12: false })

const chip = (v: string) => '`' + v + '`'

const SITE = 'https://technooptimists.org'

// ── the catalogue ──────────────────────────────────────────────────────────
// A new alert is an entry here plus one notify() call. post() prepends the
// timestamp, so a new builder cannot forget to stamp itself.
const EVENTS = {
  // The Challenge is the core object of this product. If only one alert ever
  // fires, it is this one.
  challenge_created: {
    channel: 'product',
    text: (p: { slug: string; title: string; type: string; author: string }) =>
      `🧩 New Challenge — *<${SITE}/c/${p.slug}|${p.title}>* · ${p.type} · by ${p.author}`,
  },
  // A new person, not a new session: this fires once per human, inside the
  // `if (!person)` branch of the auth callback.
  person_created: {
    channel: 'growth',
    text: (p: { handle: string; email: string }) =>
      `👋 New person — ${chip('@' + p.handle)} · ${chip(p.email)}`,
  },
  comment_posted: {
    channel: 'product',
    text: (p: { slug: string; kind: string; author: string; preview: string }) =>
      `💬 ${p.kind === 'idea' ? 'Idea' : 'Response'} on *<${SITE}/c/${p.slug}|${p.slug}>* by ${p.author}\n> ${p.preview}`,
  },
  // Someone pointed their own AI credits at this site. Growth, not product:
  // it is a person deciding to fund other people's problems, which is the
  // single strongest signal the idea works.
  ai_account_connected: {
    channel: 'growth',
    text: (p: { handle: string; provider: string }) =>
      `🔌 AI account connected — ${chip('@' + p.handle)} · ${p.provider} · runs on their own credits`,
  },
  import_failed: {
    channel: 'alerts',
    text: (p: { failures: string[] }) =>
      `🚨 Import failures (${p.failures.length}) — ${p.failures.slice(0, 6).join(' · ')}${p.failures.length > 6 ? ` … +${p.failures.length - 6}` : ''}`,
  },
} as const

type EventName = keyof typeof EVENTS
type Payload<K extends EventName> = Parameters<(typeof EVENTS)[K]['text']>[0]

/**
 * Post one message. Never throws.
 *
 * Slack reports failure in the BODY with HTTP 200 - `{ok: false, error:
 * "not_in_channel"}` is the usual one, and it is what a bot that was never
 * invited to the channel returns. Checking res.ok alone logs a silently dropped
 * message as a success, which is exactly how a dead alert pipe stays invisible.
 */
async function post(env: SlackEnv, ch: Channel, text: string): Promise<void> {
  const token = env.SLACK_BOT_TOKEN
  const channel = channelId(env, ch)
  if (!token || !channel) {
    console.log('[slack:noop]', ch, text)
    return
  }
  try {
    const res = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({ channel, text }),
      signal: AbortSignal.timeout(5000),
    })
    const body = await res.json().catch(() => null) as { ok?: boolean; error?: string } | null
    if (body?.ok) console.log('[slack:sent]', ch, text.slice(0, 80))
    else console.error('[slack:fail]', ch, body?.error ?? `http ${res.status}`)
  } catch (e) {
    console.error('[slack:error]', ch, (e as Error)?.message)
  }
}

/**
 * Fire and forget from a route. `c` is the Hono context, typed loose for the
 * same reason track() takes a narrowed env: a route passes what it has without
 * importing a context generic.
 *
 * Falls back to a bare promise when there is no executionCtx (tests, the
 * build-time API) so a missing context drops the alert rather than throwing.
 */
export function notify<K extends EventName>(c: any, event: K, payload: Payload<K>): void {
  try {
    const def = EVENTS[event]
    const text = `${stamp()} · ${(def.text as (p: Payload<K>) => string)(payload)}`
    const sending = post(c.env as SlackEnv, def.channel as Channel, text)
    c.executionCtx?.waitUntil?.(sending)
  } catch (e) {
    console.error('[slack:notify]', (e as Error)?.message)
  }
}

/** Same catalogue for code holding `env` but no request context. */
export function notifyEnv<K extends EventName>(env: SlackEnv, event: K, payload: Payload<K>): Promise<void> {
  const def = EVENTS[event]
  const text = `${stamp()} · ${(def.text as (p: Payload<K>) => string)(payload)}`
  return post(env, def.channel as Channel, text)
}
