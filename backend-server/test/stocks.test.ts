import { afterEach, describe, expect, it } from 'vitest'
import { clearMocks, makeApp, sampleRawBars } from './helpers'

const stocks = { sh600519: { name: '贵州茅台', bars: sampleRawBars(80) } }

describe('stocks', () => {
  afterEach(clearMocks)

  it('GET /stocks/{code} 元信息', async () => {
    const app = makeApp(stocks)
    const res = await app.inject({ method: 'GET', url: '/api/v1/stocks/sh600519' })
    expect(res.json()).toMatchObject({ code: 'sh600519', name: '贵州茅台', market: 'sh', kind: 'stock' })
  })

  it('GET /stocks/{code}/kline 返回 K 线 + nextBefore', async () => {
    const app = makeApp(stocks)
    const res = await app.inject({ method: 'GET', url: '/api/v1/stocks/sh600519/kline?period=day&limit=10' })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.bars).toHaveLength(10)
    expect(body.nextBefore).toBe(body.bars[0].time)
  })

  it('GET /stocks/{code}/kline 未知股票 → 404 NOT_FOUND', async () => {
    const app = makeApp(stocks)
    const res = await app.inject({ method: 'GET', url: '/api/v1/stocks/sh999999/kline' })
    expect(res.statusCode).toBe(404)
    expect(res.json().error.code).toBe('NOT_FOUND')
  })

  it('GET /stocks/search?q=600519 代码搜索', async () => {
    const app = makeApp(stocks)
    const res = await app.inject({ method: 'GET', url: '/api/v1/stocks/search?q=600519' })
    expect(res.json()[0]).toMatchObject({ code: 'sh600519' })
  })

  it('GET /stocks/search?q=茅台 名称搜索', async () => {
    const app = makeApp(stocks)
    const res = await app.inject({ method: 'GET', url: '/api/v1/stocks/search?q=茅台' })
    expect(res.json().map((s: { name: string }) => s.name)).toContain('贵州茅台')
  })

  it('POST /stocks/kline/batch 批量(含失败占位 null)', async () => {
    const app = makeApp(stocks)
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/stocks/kline/batch',
      payload: { items: [{ code: 'sh600519', period: 'day', limit: 5 }, { code: 'sh999999' }] },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.sh600519.bars).toHaveLength(5)
    expect(body.sh999999).toBeNull()
  })
})
