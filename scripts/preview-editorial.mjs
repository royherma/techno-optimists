/** Read-only preview of built pages against the public production feed.
 * Usage: node scripts/preview-editorial.mjs [port]
 * Writes are deliberately refused; use the real dev Worker for form submissions.
 */
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { resolve, extname } from 'node:path'
const root = resolve('apps/web/dist')
const mime = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.png':'image/png', '.jpg':'image/jpeg', '.svg':'image/svg+xml', '.json':'application/json', '.webp':'image/webp' }
createServer(async (req, res) => {
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); res.end('Read-only preview'); return }
    const url = new URL(req.url, 'http://localhost')
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/media/')) {
      const response = await fetch('https://technooptimists.org' + url.pathname + url.search)
      res.writeHead(response.status, { 'content-type': response.headers.get('content-type') || 'application/octet-stream' }); res.end(Buffer.from(await response.arrayBuffer())); return
    }
    let file = resolve(root, '.' + decodeURIComponent(url.pathname))
    if (!file.startsWith(root + '/') && file !== root) { res.writeHead(403); res.end(); return }
    if ((await stat(file)).isDirectory()) file += '/index.html'
    res.writeHead(200, { 'content-type': mime[extname(file)] || 'application/octet-stream', 'cache-control':'no-store' }); res.end(await readFile(file))
  } catch { res.writeHead(404); res.end('Not found') }
}).listen(Number(process.argv[2] || 4326), '127.0.0.1', () => console.log('Read-only editorial preview ready'))
