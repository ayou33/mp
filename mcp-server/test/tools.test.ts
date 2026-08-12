import { afterEach, describe, expect, it, vi } from 'vitest'
import { BackendClient } from '../src/backend'
import { buildToolDefs } from '../src/tools'

type Call = { url: string; init: RequestInit }

function mockFetch(respond: (url: string, init: RequestInit) => { status?: number; body?: unknown }): Call[] {
  const calls: Call[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url)
      calls.push({ url: u, init: init ?? {} })
      const r = respond(u, init ?? {})
      const status = r.status ?? 200
      // 204 无 body(带 body 会抛错)
      if (status === 204) return new Response(null, { status: 204 })
      const body = r.body !== undefined ? JSON.stringify(r.body) : ''
      return new Response(body, { status, headers: { 'content-type': 'application/json' } })
    }),
  )
  return calls
}

const BASE = 'http://x/api/v1'

describe('mcp tools → backend REST', () => {
  afterEach(() => vi.unstubAllGlobals())

  function handlers() {
    const defs = buildToolDefs(new BackendClient(BASE))
    return Object.fromEntries(defs.map((d) => [d.name, d.handler]))
  }

  it('注册 25 个工具', () => {
    expect(buildToolDefs(new BackendClient(BASE)).length).toBe(25)
  })

  it('list_watchlist → GET /watchlist', async () => {
    const calls = mockFetch(() => ({ body: [{ code: 'sh000001', name: '上证指数' }] }))
    const h = handlers()
    const r = await h.list_watchlist({})
    expect(calls[0].url).toBe(`${BASE}/watchlist`)
    expect(calls[0].init.method).toBe('GET')
    expect(r.isError).toBeUndefined()
    const data = JSON.parse(r.content[0].text) as Array<{ code: string }>
    expect(data[0].code).toBe('sh000001')
  })

  it('remove_watchlist → DELETE /watchlist/{code}(级联清画线由后端处理)', async () => {
    const calls = mockFetch(() => ({ status: 204 }))
    const r = await handlers().remove_watchlist({ code: 'sh600519' })
    expect(calls[0].url).toBe(`${BASE}/watchlist/sh600519`)
    expect(calls[0].init.method).toBe('DELETE')
    expect((r.structuredContent as { ok: boolean }).ok).toBe(true)
  })

  it('get_kline 拼接查询参数', async () => {
    const calls = mockFetch(() => ({ body: { code: 'sh600519', bars: [] } }))
    await handlers().get_kline({ code: 'sh600519', period: 'day', limit: 20 })
    expect(calls[0].url).toBe(`${BASE}/stocks/sh600519/kline?period=day&limit=20`)
    expect(calls[0].init.method).toBe('GET')
  })

  it('list_watchlist_drawings 缺省只看 system', async () => {
    const calls = mockFetch(() => ({ body: {} }))
    await handlers().list_watchlist_drawings({})
    expect(calls[0].url).toBe(`${BASE}/watchlist/drawings`)
    const withSource = mockFetch(() => ({ body: {} }))
    await handlers().list_watchlist_drawings({ source: 'user' })
    expect(withSource[0].url).toBe(`${BASE}/watchlist/drawings?source=user`)
  })

  it('calc_indicator → POST /indicators/calc(body 透传)', async () => {
    const calls = mockFetch(() => ({ body: { barsCount: 100, outputs: {} } }))
    const payload = { bars: [{ time: '2026-01-05', open: 1, high: 2, low: 0.5, close: 1.5, volume: 100 }], indicators: [{ id: 'macd' }] }
    await handlers().calc_indicator(payload)
    expect(calls[0].url).toBe(`${BASE}/indicators/calc`)
    expect(calls[0].init.method).toBe('POST')
    expect(JSON.parse(String(calls[0].init.body))).toEqual(payload)
  })

  it('save_formula:无 id → POST,有 id → PUT', async () => {
    const createCalls = mockFetch(() => ({ status: 201, body: { id: 'u_1' } }))
    await handlers().save_formula({ record: { title: 'x', shape: 'line', formula: 'C' } })
    expect(createCalls[0].url).toBe(`${BASE}/formulas`)
    expect(createCalls[0].init.method).toBe('POST')

    const updateCalls = mockFetch(() => ({ status: 200, body: { id: 'u_1' } }))
    await handlers().save_formula({ record: { id: 'u_1', title: 'x', shape: 'line', formula: 'C' } })
    expect(updateCalls[0].url).toBe(`${BASE}/formulas/u_1`)
    expect(updateCalls[0].init.method).toBe('PUT')
  })

  it('后端错误 → isError:true', async () => {
    mockFetch(() => ({ status: 404, body: { error: { code: 'NOT_FOUND', message: 'x' } } }))
    const r = await handlers().get_stock({ code: 'sh999999' })
    expect(r.isError).toBe(true)
    expect(r.content[0].text).toContain('404')
  })
})
