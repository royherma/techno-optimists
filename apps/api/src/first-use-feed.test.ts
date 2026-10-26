import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Challenge } from '../../../packages/types'

const harness = vi.hoisted(() => ({ values: [] as unknown[], effect: undefined as undefined | (() => (() => void)), cache: null as unknown, writes: [] as unknown[] }))
vi.mock('react', () => ({
  useState: (initial: unknown) => {
    const index = harness.values.length
    harness.values.push(initial)
    return [initial, (value: unknown) => { harness.values[index] = value }]
  },
  useEffect: (effect: () => (() => void)) => { harness.effect = effect },
}))
vi.mock('../../web/src/lib/feed-cache', () => ({ readFeedCache: () => harness.cache, writeFeedCache: (value: unknown) => harness.writes.push(value) }))
import { useFeed } from '../../web/src/components/newspaper/useFeed'
const snapshot = [{ id: 'saved' }] as Challenge[]
const response = (challenges: Challenge[], next_cursor: string | null = null) => ({ ok: true, json: async () => ({ challenges, next_cursor }) })
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve() }

beforeEach(() => {
  vi.useFakeTimers()
  harness.values = []; harness.cache = null; harness.writes = []; harness.effect = undefined
  vi.stubGlobal('window', { setTimeout, clearTimeout })
})
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

describe('first-use feed availability', () => {
  it('exposes build data before starting any live fetch and preserves it on failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    const feed = useFeed(snapshot)
    expect(feed.challenges).toBe(snapshot); expect(feed.loading).toBe(false)
    harness.effect!(); await flush()
    expect(harness.values).toEqual([snapshot, true, false]); expect(harness.writes).toEqual([])
  })
  it('keeps the snapshot while assembling every offset page, then caches the complete refresh', async () => {
    let finish: (value: unknown) => void = () => {}
    const fetch = vi.fn().mockResolvedValueOnce(response(snapshot, '50')).mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    vi.stubGlobal('fetch', fetch)
    useFeed(snapshot); harness.effect!(); await flush()
    expect(harness.values[0]).toBe(snapshot)
    expect(fetch.mock.calls[1][0]).toBe('/api/challenges?limit=50&offset=50')
    const second = [{ id: 'second' }] as Challenge[]
    finish(response(second)); await flush()
    expect(harness.values[0]).toEqual([...snapshot, ...second]); expect(harness.writes).toEqual([[...snapshot, ...second]])
  })
  it('uses the warm cache immediately and preserves it when a later page fails', async () => {
    const cached = [{ id: 'cached' }] as Challenge[]; harness.cache = cached
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response(snapshot, '50')).mockRejectedValueOnce(new Error('offline')))
    useFeed(snapshot); harness.effect!(); await flush()
    expect(harness.values).toEqual([cached, true, false]); expect(harness.writes).toEqual([])
  })
  it('releases an empty initial feed on abort', async () => {
    vi.stubGlobal('fetch', (_url: unknown, options: RequestInit) => new Promise((_resolve, reject) => options.signal!.addEventListener('abort', () => reject(new Error('abort')))))
    expect(useFeed([]).loading).toBe(true); harness.effect!()
    await vi.advanceTimersByTimeAsync(8000)
    expect(harness.values).toEqual([[], true, false])
  })
  it('ignores a late response after timeout even if a transport resolves after abort', async () => {
    let finish: (value: unknown) => void = () => {}
    vi.stubGlobal('fetch', () => new Promise(resolve => { finish = resolve }))
    useFeed(snapshot); harness.effect!(); await vi.advanceTimersByTimeAsync(8000)
    finish(response([{ id: 'late' }] as Challenge[])); await flush()
    expect(harness.values[0]).toBe(snapshot); expect(harness.writes).toEqual([])
  })
  it('ignores completion after unmount', async () => {
    let finish: (value: unknown) => void = () => {}
    vi.stubGlobal('fetch', () => new Promise(resolve => { finish = resolve }))
    useFeed(snapshot); const dispose = harness.effect!(); dispose()
    finish(response([])); await flush()
    expect(harness.values).toEqual([snapshot, false, false]); expect(harness.writes).toEqual([])
  })
})
