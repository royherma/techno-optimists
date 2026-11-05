import { build } from 'esbuild'
import { createServer } from 'node:http'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { Readable } from 'node:stream'

const root = fileURLToPath(new URL('../', import.meta.url))
const outfile = `${root}apps/api/test/helpers/security-preview-tmp.mjs`
await build({
  stdin: {
    contents: "export { app, secured } from './apps/api/src/index'; export { securityFixture } from './apps/api/test/helpers/security'",
    resolveDir: root,
  },
  bundle: true, platform: 'node', format: 'esm', outfile,
})
const { app, secured, securityFixture } = await import(pathToFileURL(outfile).href)
const fixture = await securityFixture()
fixture.sqlite.exec("INSERT INTO ai_runs(id,challenge_id,person_id,action,model,output) VALUES ('preview','c1','p1','draft','test-model','Local preview output')")
globalThis.fetch = async () => { throw new Error('External requests disabled in security preview') }
const port = Number(process.argv[2] ?? 8791)
const server = createServer(async (incoming, outgoing) => {
  try {
    const request = new Request(`http://${incoming.headers.host ?? `127.0.0.1:${port}`}${incoming.url}`, {
      method: incoming.method,
      headers: incoming.headers,
      ...(!['GET', 'HEAD'].includes(incoming.method) ? { body: Readable.toWeb(incoming), duplex: 'half' } : {}),
    })
    const response = secured(await app.fetch(request, { DB: fixture.DB, ENVIRONMENT: 'dev' }), request)
    outgoing.writeHead(response.status, {
      ...Object.fromEntries(response.headers),
      ...(response.headers.getSetCookie().length ? { 'set-cookie': response.headers.getSetCookie() } : {}),
    })
    outgoing.end(Buffer.from(await response.arrayBuffer()))
  } catch (error) {
    outgoing.writeHead(500)
    outgoing.end(String(error))
  }
})
server.listen(port, '127.0.0.1', () => console.log(`Security fixture API: http://127.0.0.1:${port}; in-memory only; outbound fetch disabled`))
const stop = () => server.close(() => { fixture.sqlite.close(); process.exit(0) })
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
