import { hashToken } from '../../src/auth'
import { sqliteD1 } from './sqlite-d1'

export const securityFixture = async () => {
  const { sqlite, DB } = sqliteD1('schema.sql', 'community.sql')
  sqlite.exec("INSERT INTO people(id,handle,name) VALUES ('p1','reader','Private Name'),('p2','other','Other Private'); INSERT INTO identities(person_id,email) VALUES ('p1','reader@example.test'),('p2','other@example.test'); INSERT INTO challenges(id,slug,type,title,summary,author_id) VALUES ('c1','pond','problem','A pond problem','A pond needs help','p1')")
  const token = 'a'.repeat(64)
  const otherToken = 'b'.repeat(64)
  for (const [id, value] of [['p1', token], ['p2', otherToken]]) {
    sqlite.prepare('INSERT INTO sessions(token_hash,person_id,expires_at) VALUES (?,?,?)')
      .run(await hashToken(value), id, '2099-01-01')
  }
  return { sqlite, DB, token, otherToken, headers: { cookie: `to_session=${token}`, 'content-type': 'application/json' } }
}
