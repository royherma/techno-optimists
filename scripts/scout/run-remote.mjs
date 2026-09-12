#!/usr/bin/env node
// Operator-only run: same pipeline and real bindings, no public trigger endpoint.
import { unstable_dev, unstable_readConfig } from 'wrangler';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
if (process.argv.includes('--help')) {
  console.log('npm run scout:run:remote — publish one bounded Scout batch using production bindings. Up to twice per UTC day; optional SCOUT_SOURCE=feed-id; requires Wrangler login.');
  process.exit(0);
}
if (!process.env.TECHNO_OPERATION_TOKEN) throw new Error('Use npm run scout:run:remote to acquire the repository operation lock.');
const config = unstable_readConfig({ config: resolve('wrangler.jsonc'), env: 'prod' });
const remote = (entries, binding) => {
  const found = entries.find(e => e.binding === binding);
  if (!found) throw new Error(`Missing production binding ${binding}`);
  return [{ ...found, remote: true }];
};
if (config.vars.SCOUT_ENABLED !== 'true') throw new Error('Scout is disabled in production config.');
const dir = resolve('outputs/scout-manual', randomUUID());
await mkdir(dir, { recursive: true });
const token = randomUUID();
const path = resolve(dir, 'wrangler.jsonc');
await writeFile(path, JSON.stringify({
  name: 'scout-operator-run', main: resolve('scripts/scout/remote-entry.ts'), account_id: config.account_id,
  compatibility_date: config.compatibility_date, compatibility_flags: config.compatibility_flags,
  vars: { SCOUT_ENABLED: 'true', OPERATOR_RUN_TOKEN: token }, ai: { binding: 'AI', remote: true },
  d1_databases: remote(config.d1_databases, 'DB'), kv_namespaces: remote(config.kv_namespaces, 'CACHE'), r2_buckets: remote(config.r2_buckets, 'MEDIA'),
}));
let worker;
try {
  worker = await unstable_dev(resolve('scripts/scout/remote-entry.ts'), { config: path, ip: '127.0.0.1', port: 0, logLevel: 'error', experimental: { disableExperimentalWarning: true, watch: false } });
  const sourceIndex = process.argv.indexOf('--source');
  const source = sourceIndex >= 0 ? process.argv[sourceIndex + 1] : process.env.SCOUT_SOURCE;
  const result = await worker.fetch(source ? `/?source=${encodeURIComponent(source)}` : '/', { method: 'POST', headers: { 'x-operator-run-token': token } });
  const body = await result.text();
  await writeFile(resolve(dir, 'report.json'), body);
  console.log(body);
  console.log(`Report: ${resolve(dir, 'report.json')}`);
  if (!result.ok) process.exitCode = 1;
} finally {
  await worker?.stop();
}
