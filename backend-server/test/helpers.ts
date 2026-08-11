import { vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import type { KlineBar } from '@mp/shared'
import { createApp } from '../src/app'
import { openDb } from '../src/db'
import { createTencentClient } from '../src/tencent'

export interface MockStock {
  name: string
  bars: Array<[string, string, string, string, string, string]>
}

/** 确定性合成 K 线原始行(每周一跳,避免周末) */
export function sampleRawBars(n = 60): Array<[string, string, string, string, string, string]> {
  const out: Array<[string, string, string, string, string, string]> = []
  let price = 100
  for (let i = 0; i < n; i++) {
    const t = new Date(Date.UTC(2026, 0, 5 + i * 7))
    const time = t.toISOString().slice(0, 10)
    const open = price
    const close = Math.max(1, open + Math.sin(i) * 2 + (i % 3) - 1)
    const high = Math.max(open, close) + 1
    const low = Math.min(open, close) - 1
    out.push([time, open.toFixed(2), close.toFixed(2), high.toFixed(2), low.toFixed(2), String(1000000 + i * 1000)])
    price = close
  }
  return out
}

/** 原始行 → API KlineBar[] */
export function toBars(raw: Array<[string, string, string, string, string, string]>): KlineBar[] {
  return raw.map((r) => ({
    time: r[0],
    open: Number(r[1]),
    high: Number(r[3]),
    low: Number(r[4]),
    close: Number(r[2]),
    volume: Number(r[5]),
  }))
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
}

/** 用 mock fetch 模拟腾讯接口(解析 param,按 registry 返回) */
export function mockTencentFetch(stocks: Record<string, MockStock>): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request) => {
      const u = String(input)
      const m = u.match(/param=([^,]+),([^,]+),([^,]*),([^,]*),(\d+),qfq/)
      if (!m) return new Response('', { status: 400 })
      const code = m[1]
      const before = m[4]
      const count = Number(m[5]) || Infinity
      const stock = stocks[code]
      if (!stock) return json({ code: 0, msg: '', data: {} })
      const bars = stock.bars.filter((b) => !before || b[0] < before).slice(0, count)
      return json({ code: 0, msg: '', data: { [code]: { qfqday: bars, qt: { [code]: ['', stock.name] } } } })
    }),
  )
}

/** 构建带内存 SQLite + 0 限流延迟 + mock fetch 的 app */
export function makeApp(stocks: Record<string, MockStock>): FastifyInstance {
  mockTencentFetch(stocks)
  const db = openDb(':memory:')
  const tencent = createTencentClient({ minRequestGapMs: 0 })
  return createApp({ db, tencent })
}

export function clearMocks(): void {
  vi.unstubAllGlobals()
}
