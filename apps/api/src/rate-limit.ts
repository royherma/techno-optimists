import type { Context } from 'hono'
import { hashToken } from './auth'

const LIMITS = {
  thread: { count: 5, seconds: 3600 },
  update: { count: 10, seconds: 60 },
  action: { count: 30, seconds: 60 },
  comment: { count: 5, seconds: 60 },
  upload: { count: 10, seconds: 3600 },
  view: { count: 60, seconds: 60 },
  client_error: { count: 5, seconds: 60 },
} as const

export const writeLimited = async (
  c: Context<{ Bindings: { DB: D1Database } }>,
  subject: string,
  scope: keyof typeof LIMITS,
) => {
  const limit = LIMITS[scope]
  const accepted = await c.env.DB.prepare(`INSERT INTO write_limits (scope, subject, count, expires_at)
    VALUES (?, ?, 1, unixepoch() + ?)
    ON CONFLICT(scope, subject) DO UPDATE SET
      count = CASE WHEN expires_at <= unixepoch() THEN 1 ELSE count + 1 END,
      expires_at = CASE WHEN expires_at <= unixepoch() THEN excluded.expires_at ELSE expires_at END
    WHERE expires_at <= unixepoch() OR count < ?
    RETURNING count`).bind(scope, subject, limit.seconds, limit.count).first()
  if (accepted) return false
  c.header('Retry-After', String(limit.seconds))
  return true
}

export const anonymousLimited = async (
  c: Context<{ Bindings: { DB: D1Database } }>,
  scope: 'view' | 'client_error',
) => writeLimited(c, await hashToken(`${scope}|${c.req.header('cf-connecting-ip') ?? 'unknown'}`), scope)
