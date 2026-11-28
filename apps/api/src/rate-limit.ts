import { hashToken } from './auth'

export const takeQuota = async (db: D1Database, scope: string, actor: string, limit: number, seconds: number) => {
  const key = await hashToken(`${scope}:${actor}`)
  const row = await db.prepare(`
    INSERT INTO request_limits (key, count, expires_at) VALUES (?, 1, unixepoch() + ?)
    ON CONFLICT(key) DO UPDATE SET
      count = CASE WHEN expires_at <= unixepoch() THEN 1 ELSE count + 1 END,
      expires_at = CASE WHEN expires_at <= unixepoch() THEN excluded.expires_at ELSE expires_at END
    WHERE expires_at <= unixepoch() OR count < ?
    RETURNING 1 AS allowed
  `).bind(key, seconds, limit).first<{ allowed: number }>()
  return row?.allowed === 1
}
