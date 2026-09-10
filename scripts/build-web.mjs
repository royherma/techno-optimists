// `astro build` runs getStaticPaths, which fetches the live API. Start an
// API-only Worker (no assets binding, so emptying apps/web/dist can't kill it),
// wait for /api/health, build, then stop it. See wrangler.build.jsonc.
import { spawn } from 'node:child_process'

const PORT = process.env.BUILD_API_PORT ?? '8792'
const base = `http://127.0.0.1:${PORT}`

const api = spawn(
  'npx',
  ['wrangler', 'dev', '--config', 'wrangler.build.jsonc', '--port', PORT, '--local'],
  { stdio: ['ignore', 'pipe', 'pipe'] },
)
let apiLog = ''
api.stdout.on('data', (d) => { apiLog += d })
api.stderr.on('data', (d) => { apiLog += d })

const stop = () => { if (!api.killed) api.kill('SIGTERM') }
process.on('exit', stop)
process.on('SIGINT', () => { stop(); process.exit(130) })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let up = false
for (let i = 0; i < 60; i++) {
  try {
    const r = await fetch(`${base}/api/health`)
    if (r.ok) { up = true; break }
  } catch { /* not listening yet */ }
  if (api.exitCode !== null) break
  await sleep(500)
}

if (!up) {
  console.error(`build API never came up on ${base}\n${apiLog}`)
  stop()
  process.exit(1)
}
console.log(`build API ready on ${base}`)

const build = spawn('npm', ['--workspace', 'web', 'run', 'build'], {
  stdio: 'inherit',
  env: { ...process.env, PUBLIC_API_BASE: base },
})
build.on('exit', (code) => { stop(); process.exit(code ?? 1) })
