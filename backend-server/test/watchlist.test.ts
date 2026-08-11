import { afterEach, describe, expect, it } from 'vitest'
import { clearMocks, makeApp, sampleRawBars } from './helpers'

const stocks = {
  sh600519: { name: '贵州茅台', bars: sampleRawBars() },
  sh000001: { name: '上证指数', bars: sampleRawBars() },
  sh000680: { name: '科创综指', bars: sampleRawBars() },
  sz399006: { name: '创业板指', bars: sampleRawBars() },
}

describe('watchlist', () => {
  afterEach(clearMocks)

  it('GET /watchlist 首次返回默认三大指数', async () => {
    const app = makeApp(stocks)
    const res = await app.inject({ method: 'GET', url: '/api/v1/watchlist' })
    expect(res.statusCode).toBe(200)
    expect(res.json().map((x: { code: string }) => x.code)).toEqual(['sh000001', 'sh000680', 'sz399006'])
  })

  it('PUT /watchlist/{code} 加入(幂等)', async () => {
    const app = makeApp(stocks)
    const add = await app.inject({ method: 'PUT', url: '/api/v1/watchlist/sh600519' })
    expect(add.statusCode).toBe(200)
    expect(add.json()).toMatchObject({ code: 'sh600519', name: '贵州茅台' })
    const again = await app.inject({ method: 'PUT', url: '/api/v1/watchlist/sh600519' })
    expect(again.json().code).toBe('sh600519')
    const list = await app.inject({ method: 'GET', url: '/api/v1/watchlist' })
    expect(list.json().filter((x: { code: string }) => x.code === 'sh600519')).toHaveLength(1)
  })

  it('DELETE /watchlist/{code} 级联删除该股全部画线', async () => {
    const app = makeApp(stocks)
    await app.inject({
      method: 'PUT',
      url: '/api/v1/drawings',
      payload: { stock: 'sh600519', period: 'day', items: [{ id: 1, kind: 'price-line', source: 'user', price: 100 }] },
    })
    await app.inject({ method: 'PUT', url: '/api/v1/watchlist/sh600519' })
    const del = await app.inject({ method: 'DELETE', url: '/api/v1/watchlist/sh600519' })
    expect(del.statusCode).toBe(204)
    const d = await app.inject({ method: 'GET', url: '/api/v1/drawings?stock=sh600519&period=day' })
    expect(d.json()).toEqual([])
  })

  it('DELETE 不存在的自选返回 404', async () => {
    const app = makeApp(stocks)
    const res = await app.inject({ method: 'DELETE', url: '/api/v1/watchlist/sh600519' })
    expect(res.statusCode).toBe(404)
  })
})
