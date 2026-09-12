import { runScout } from '../../apps/api/src/scout-cloudflare'
// Local operator harness only. Never used as the deployed Worker's entry point.
export default { async fetch(request: Request, env: Cloudflare.Env & { OPERATOR_RUN_TOKEN: string }) {
  if (request.method !== 'POST' || !env.OPERATOR_RUN_TOKEN || request.headers.get('x-operator-run-token') !== env.OPERATOR_RUN_TOKEN) return new Response('Not found', { status: 404 })
  const params = new URL(request.url).searchParams
  try { return Response.json(await runScout(env, Date.now(), params.has('article') ? 'verification' : 'manual', params.get('source') ?? undefined, params.get('article') ?? undefined)) }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'run_failed' }, { status: 500 }) }
} }
